import websocket, json, time, urllib.request, sys

# Get page URL
r = urllib.request.urlopen('http://localhost:9222/json/list')
targets = json.loads(r.read())
page = next((t for t in targets if t.get('type')=='page'), None)
if not page:
    print('No page'); sys.exit(1)

ws_url = page['webSocketDebuggerUrl']
print('URL:', ws_url, flush=True)

try:
    ws = websocket.create_connection(ws_url, timeout=10)
    print('Connected!', flush=True)
    
    mid = [0]
    def send(m, p=None):
        mid[0]+=1
        c={'id':mid[0],'method':m}
        if p: c['params']=p
        ws.send(json.dumps(c))
        while True:
            r=json.loads(ws.recv())
            if r.get('id')==mid[0]: return r.get('result',{})
    
    def js(e):
        r=send('Runtime.evaluate',{'expression':e,'returnByValue':True})
        return r.get('result',{}).get('value')
    
    send('Page.enable'); send('Runtime.enable')
    
    # AE Login
    print('=== AE Login ===', flush=True)
    js('document.querySelector("#authCode").value="TEST-LAUNCH-AE";document.querySelector("#authCode").dispatchEvent(new Event("input",{bubbles:true}));')
    time.sleep(0.5)
    js('document.querySelector("button[type=submit]").click()')
    time.sleep(5)
    print('Hash:', js('window.location.hash'), flush=True)
    print('Platform:', js('document.querySelector(".platform-label")?.textContent||"none"'), flush=True)
    print('Btns:', js('Array.from(document.querySelectorAll(".platform-btn")).map(b=>b.textContent.trim()+"|"+(b.classList.contains("active")?"A":"")+(b.classList.contains("disabled")?"D":"")).join(",")'), flush=True)
    
    # Tools
    print('=== Tools ===', flush=True)
    send('Page.navigate',{'url':'http://localhost:3000/#/user/tools'})
    time.sleep(5)
    print('Hash:', js('window.location.hash'), flush=True)
    print('Tools:', js('Array.from(document.querySelectorAll(".tool-card .stat-label")).map(e=>e.textContent.trim()).join(",")'), flush=True)
    print('Platform:', js('document.querySelector(".platform-label")?.textContent||"none"'), flush=True)
    print('Btns:', js('Array.from(document.querySelectorAll(".platform-btn")).map(b=>b.textContent.trim()+"|"+(b.classList.contains("active")?"A":"")+(b.classList.contains("disabled")?"D":"")).join(",")'), flush=True)
    
    # AI Chat
    print('=== AI Chat ===', flush=True)
    send('Page.navigate',{'url':'http://localhost:3000/#/user/ai-chat'})
    time.sleep(5)
    print('Hash:', js('window.location.hash'), flush=True)
    print('Chat:', js('document.querySelector(".ai-chat-container")!==null||document.querySelector(".chat-header")!==null'), flush=True)
    
    # Admin
    print('=== Admin ===', flush=True)
    send('Page.navigate',{'url':'http://localhost:3000/#/admin/login'})
    time.sleep(4)
    print('Hash:', js('window.location.hash'), flush=True)
    print('Form:', js('document.querySelector("input[type=password]")!==null'), flush=True)
    
    ws.close()
    print('=== DONE ===', flush=True)
except Exception as e:
    print('Error:', e, flush=True)
    sys.exit(1)