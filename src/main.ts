import Session from "./tome/Session";

const host = new URLSearchParams(window.location.search).get("host")
const join = new URLSearchParams(window.location.search).get("join")

if(host) Session.host(host)
if(join) Session.join(join)
