import type { ActionReceiver, ActionSender, Room } from "trystero"
import      { joinRoom, selfId                   } from "trystero"

import { filter, reduce, reject } from   "lodash"

import Tome   from "./Tome"
import Secret from "./Secret"

export interface Session {
  readonly is    : "client" | "server"
  readonly id    : string
  readonly pw    : string
  readonly secret: string

  readonly room: Room
  readonly tx  : ActionSender  <Message>
  readonly rx  : ActionReceiver<Message>
  
  readonly clientIds: Set<string>
  readonly clientId :     string
           serverId :     string

  readonly listeners: Map<string, Set<Listener<any>>>
  readonly requests : Map<string, Request           >
}

export namespace Session {
  export const APPLICATION_ID: string = Tome.VERSION.toString()

  export function host(secret ?: Secret): Session {
    if(!secret) secret = Secret.random()
    const
      id = Secret.id(secret),
      pw = Secret.pw(secret);
    secret = Secret.mend([id, pw], false)

    console.log(`hosting... ${secret}`)

    const   room   = joinRoom({appId: APPLICATION_ID, password: pw}, id)
    const [tx, rx] = room.makeAction<Message>("message")

    const sesh: Session = {
      is:   "server",
      id, pw, secret,
      // trystero api
      room  , tx, rx,
      clientId: selfId,
      serverId: selfId,
      clientIds: new Set(),
      listeners: new Map(),
      requests : new Map()
    }

    room.onPeerLeave(async peerId => {
      // reject pending requests
      for(const [reqId, pending] of sesh.requests) {
        if(pending.peerId === peerId)
          rejectRequest(sesh, reqId)
      }

      if(sesh.clientIds.delete(peerId))
        message(sesh, "client-disconnected", peerId)
    })

    room.onPeerJoin (async peerId => {
      const
        __hello__ = await Session.hash(  peerId ),
        __world__ = await Session.hash(__hello__);
      if( __world__ === await request(sesh, "__hello__", __hello__, {dst: peerId})) {
        message(sesh, "client-connected", peerId)
        for(const clientId of sesh.clientIds) {
          message(sesh, "client-connected",  peerId , {dst: clientId})
          message(sesh, "client-connected", clientId, {dst:  peerId })
        }
        sesh.clientIds.add(peerId)
      }
    })

    rx((message, from) => onServerMessage(sesh, message, from))

    return sesh
  }

  export function join(secret ?: Secret): Session {
    if(!secret) secret = Secret.random()
    const
      id = Secret.id(secret),
      pw = Secret.pw(secret);
    secret = Secret.mend([id, pw], false)

    console.log(`joining... ${secret}`)

    const   room   = joinRoom({appId: APPLICATION_ID, password: pw}, id)
    const [tx, rx] = room.makeAction<Message>("message")

    const sesh: Session = {
      is:   "client",
      id, pw, secret,
      // trystero api
      room: room,
      tx  : tx  ,
      rx  : rx  ,
      clientId: selfId,
      serverId:     "",
      clientIds: new Set(),
      listeners: new Map(),
      requests : new Map()
    }

    room.onPeerLeave(async peerId => {
      // reject pending requests
      for(const [reqId, pending] of sesh.requests) {
        if(pending.peerId === peerId)
          rejectRequest(sesh, reqId)
      }

      if(sesh.clientIds.delete(peerId))
        message(sesh, "client-disconnected", peerId)
      else if(peerId === sesh.serverId) {
        sesh.serverId = ""
        message(sesh, "server-disconnected", peerId)
      }
    })
      
    Session.on(sesh, "__hello__", async (hello, {src, respond}) => {
      if(sesh.serverId) return
      const
        __hello__ = await Session.hash(sesh.clientId),
        __world__ = await Session.hash(  __hello__  );
      if( hello === __hello__ ) {        
        sesh.serverId = src
        respond(__world__, "__world__")
        message(sesh, "server-connected", src)
      }
    })

    Session.on(sesh, "client-connected", (clientId: string) => {
      sesh.clientIds.add(clientId)
    })

    rx((message, from) => onClientMessage(sesh, message, from))

    return sesh
  }

  export function quit(sesh: Session) {
    sesh.room?.leave()
  }

  export function message   (sesh: Session, type: string, data ?: any, optional ?: Partial<Message>)             {
    const
      src = optional?.src ?? sesh.clientId,
      dst = optional?.dst ?? sesh.clientId;

    console.log("tx", { src, dst, type, data, ...optional })

    if(dst === sesh.clientId) onMessage(sesh, { src, dst, type, data, ...optional }, dst          )
    else if(Session.isServer(sesh)) sesh.tx(  { src, dst, type, data, ...optional }, dst          )
    else if(Session.isClient(sesh)) sesh.tx(  { src, dst, type, data, ...optional }, sesh.serverId)
  }

  export function request<U>(sesh: Session, type: string, data ?: any, optional ?: Partial<Message>): Promise<U> {
    return new Promise<U>(async (
      resolvable, 
      rejectable,
    ) => {
      // compute available reqId
      let reqId = await Session.uuid()
      while(sesh.requests.has(reqId))
          reqId = await Session.uuid()

      message(sesh, type, data, {...optional, reqId})
      
      sesh.requests.set(reqId, {
        peerId : optional?.dst ?? sesh.clientId,
        resolvable,
        rejectable,
      })
    })
  }

  export function broadcastInclusive<T>(sesh: Session, type: string, data: T, ...ids: Array<string>) {

  }

  export function broadcastExclusive<T>(sesh: Session, type: string, data: T, ...ids: Array<string>) {

  }

  export function on<T>(sesh: Session, type: string, listener: Listener<T>) {
    listeners<T>(sesh, type).add(listener)
  }

  // utility functions
  export function isClient(sesh: Session) {
    return sesh.is === "client"
  }

  export function isServer(sesh: Session) {
    return sesh.is === "server"
  }

  export function include(sesh: Session, include: string[ ]): string[ ] {
    return filter(Array.from(sesh.clientIds), peerId => include.includes(peerId))
  }

  export function exclude(sesh: Session, exclude: string[ ]): string[ ] {
    return reject(Array.from(sesh.clientIds), peerId => exclude.includes(peerId))
  }

  export async function uuid(         ) {
    return hash(crypto.randomUUID())
  }

  export async function hash(s: string) {
    return btoa(reduce(new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s))), (b, i) => b + String.fromCharCode(i), ""))
  }

  /***************
   * PRIVATE API *
   ***************/

  function onServerMessage(sesh: Session, message: Message, from: string) {
    // verify message

    if(message.dst !== sesh.clientId)
      Session.message(sesh, message.type, message.data, {...message, src: from})
    else
      onMessage(sesh, message, from)
  }

  function onClientMessage(sesh: Session, message: Message, from: string) {
    onMessage(sesh, message, from)
  }

  async function onMessage(sesh: Session, message: Message, from: string) {
    console.log("rx", message)

    if(message.resId) resolveRequest(sesh, message.resId, message.data)

    const      
      src  = message.src ,
      dst  = message.dst ,
      type = message.type,
      listening = listeners(sesh, message.type),
      respond   = responder(sesh, message     ),
      request   = requester(sesh, message     ),
      context   = {src, dst, type, respond, request};
    for(const listener of [...listening])
      if(await listener(message.data, context) !== undefined)
        listening.delete(listener)
  }

  function listeners<T>(sesh: Session, type: string): Set<Listener<T>> {
    let listeners = sesh.listeners.get(type)
    if(!listeners) sesh.listeners.set(
      type, listeners = new Set()
    ) 
    return listeners
  }

  function responder(sesh: Session, message: Message) {
    return (data: any, type = message.type) => {
      Session.message(sesh, type, data, { dst: message.src, resId: message.reqId })
    }
  }

  function requester(sesh: Session, message: Message) {
    return (data: any, type = message.type) => {
      Session.request(sesh, type, data, { dst: message.src, resId: message.reqId })
    }
  }

  function resolveRequest(sesh: Session, resId: string, value  : any) {
    const pending  = sesh.requests.get(resId)
    if(pending && sesh.requests.delete(resId))
      pending.resolvable(value)
  }

  function rejectRequest (sesh: Session, resId: string, value ?: any) {
    const pending  = sesh.requests.get(resId)
    if(pending && sesh.requests.delete(resId))
      pending.rejectable (value)
  }
}

export interface Message {
  src    : string
  dst    : string
  type   : string
  data  ?: any
  reqId ?: string
  resId ?: string
}

export interface Request {
  peerId: string
  // promise
  resolvable: (value  : any) => void
  rejectable: (value ?: any) => void
}

export interface Context {
  type: string

  src : string
  dst : string
  respond: (data: any, type ?: string) => void
  request: (data: any, type ?: string) => void
}

export type Listener<T> = (data: T, context: Context) => any

export default Session