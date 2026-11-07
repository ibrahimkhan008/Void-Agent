const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ] as string,
  );

const escapeScriptValue = (value: string) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

export function buildServerPickerHtml(input: {
  defaultUrl: string;
  previousUrl: string;
  allowLocalHttp: boolean;
}) {
  const errors = JSON.stringify({
    empty: "Enter a server address.",
    invalid: "That is not a valid server address.",
    insecure: "Use HTTPS. HTTP is allowed only for localhost in development.",
    unreachable: "The server could not be reached. Check its address.",
    incompatible: "The server did not respond like a Void-Agent server.",
    forbidden: "This server change is not allowed.",
  }).replace(/</g, "\\u003c");
  const previousUrl = escapeHtml(input.previousUrl);
  const localHttp = input.allowLocalHttp ? "true" : "false";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Void-Agent server</title>
<style>
:root{color-scheme:light dark;font:15px/1.5 system-ui,sans-serif}body{margin:0;min-height:100vh;display:grid;place-items:center;background:Canvas;color:CanvasText}main{width:min(460px,calc(100% - 40px))}h1{font-size:22px}p,small{color:GrayText}label{display:flex;gap:10px;padding:12px;border:1px solid #8885;border-radius:9px;margin:10px 0}input[type=url]{box-sizing:border-box;width:100%;margin-top:8px;padding:9px;border-radius:6px;border:1px solid #888;background:Canvas;color:CanvasText}button{width:100%;padding:10px;margin-top:12px;border:0;border-radius:7px;background:#2563eb;color:white;font-weight:600}button:disabled{opacity:.6}#status{min-height:1.5em}#status.error{color:#c0262d}
</style></head><body><main>
<h1>Choose a Void-Agent server</h1>
<p>Your server choice is stored on this device. Switching servers restarts the desktop app.</p>
<form id="form"><label><input type="radio" name="mode" value="default" checked><span>Use configured Void-Agent server<br><small id="default-url"></small></span></label>
<label><input type="radio" name="mode" value="custom"><span style="flex:1">Use my own server<input id="server-url" type="url" autocomplete="url" spellcheck="false" placeholder="https://void-agent.example" value="${previousUrl}"><small>Enter the origin of your hosted Void-Agent instance.</small></span></label>
<button id="connect" type="submit">Connect</button><p id="status" role="status"></p></form></main>
<script>
const defaultUrl=${escapeScriptValue(input.defaultUrl)};const errors=${errors};const allowLocalHttp=${localHttp};
document.getElementById("default-url").textContent=defaultUrl;
const form=document.getElementById("form"),url=document.getElementById("server-url"),button=document.getElementById("connect"),status=document.getElementById("status");
url.addEventListener("focus",()=>{form.mode.value="custom"});
form.addEventListener("submit",async event=>{event.preventDefault();button.disabled=true;status.className="";status.textContent="Checking server…";try{const choice=form.mode.value==="custom"?{mode:"custom",url:url.value,allowLocalHttp}:{mode:"default"};const result=await window.serverPicker.choose(choice);if(result&&result.ok){status.textContent="Switching server…";return}status.className="error";status.textContent=errors[result&&result.reason]||errors.invalid}catch{status.className="error";status.textContent=errors.unreachable}button.disabled=false});
</script></body></html>`;
}
