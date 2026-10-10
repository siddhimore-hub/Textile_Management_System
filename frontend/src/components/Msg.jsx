export default function Msg({ msg }) { return msg ? <span className={msg.ok ? 'msg-ok' : 'err'}>{msg.text}</span> : null; }
