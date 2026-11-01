const $ = id => document.getElementById(id);
let me = null, socket = null, seen = new Set();
async function api(url, options={}) {
  const res = await fetch(url,{...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || "Ralat sistem");
  return data;
}
function showLogin(){ $("loginView").classList.remove("hidden"); $("appView").classList.add("hidden"); }
function showApp(){
  $("loginView").classList.add("hidden"); $("appView").classList.remove("hidden");
  $("myName").textContent=me.displayName; $("myAvatar").textContent=me.displayName.slice(0,1).toUpperCase();
  $("myRole").textContent=me.role==="admin"?"Pentadbir":"Ahli";
  $("adminPanel").classList.toggle("hidden",me.role!=="admin");
  loadMessages(); if(me.role==="admin") loadMembers();
  if(socket) socket.disconnect();
  socket=io(); socket.on("new-message",addMessage);
}
function addMessage(m){
  if(seen.has(m.id)) return; seen.add(m.id);
  const wrap=document.createElement("div"); wrap.className="bubble"+(m.userId===me.id?" mine":"");
  if(m.userId!==me.id){const name=document.createElement("div");name.className="sender";name.textContent=m.displayName;wrap.append(name);}
  const body=document.createElement("div");body.className="body";body.textContent=m.body;wrap.append(body);
  const time=document.createElement("div");time.className="time";time.textContent=new Date(m.createdAt.replace(" ","T")+"Z").toLocaleString("ms-MY",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"short"});wrap.append(time);
  $("messages").append(wrap); $("messages").scrollTop=$("messages").scrollHeight;
}
async function loadMessages(){try{const d=await api("/api/messages");$("messages").innerHTML='<div class="date-chip">Mesej terkini</div>';seen.clear();d.messages.forEach(addMessage);}catch(e){console.error(e);}}
async function loadMembers(){
  try{const d=await api("/api/members");$("memberList").innerHTML="";
    d.members.forEach(m=>{
      const row=document.createElement("div");row.className="member-row";
      const info=document.createElement("div");info.className="member-info";
      const b=document.createElement("b");b.textContent=m.displayName;
      const small=document.createElement("small");small.textContent="@"+m.username+" · "+(m.active?"Aktif":"Disekat");
      info.append(b,small);row.append(info);
      const toggle=document.createElement("button");toggle.textContent=m.active?"Sekat":"Aktifkan";
      toggle.onclick=async()=>{try{await api("/api/members/"+m.id,{method:"PATCH",body:JSON.stringify({active:!m.active})});loadMembers();}catch(e){alert(e.message);}};
      const del=document.createElement("button");del.textContent="Padam";del.onclick=async()=>{if(confirm("Padam ahli "+m.displayName+"?")){try{await api("/api/members/"+m.id,{method:"DELETE"});loadMembers();}catch(e){alert(e.message);}}};
      row.append(toggle,del);$("memberList").append(row);
    });
  }catch(e){$("memberFeedback").textContent=e.message;}
}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();$("loginError").textContent="";try{const d=await api("/api/login",{method:"POST",body:JSON.stringify({username:$("loginUsername").value,password:$("loginPassword").value})});me=d.user;showApp();}catch(err){$("loginError").textContent=err.message;}});
$("logoutBtn").onclick=async()=>{try{await api("/api/logout",{method:"POST"});}finally{if(socket)socket.disconnect();me=null;showLogin();}};
$("sendForm").addEventListener("submit",async e=>{e.preventDefault();const input=$("messageInput"),body=input.value.trim();if(!body)return;input.value="";try{await api("/api/messages",{method:"POST",body:JSON.stringify({body})});}catch(err){alert(err.message);input.value=body;}});
$("addMemberForm").addEventListener("submit",async e=>{e.preventDefault();$("memberFeedback").textContent="";try{await api("/api/members",{method:"POST",body:JSON.stringify({displayName:$("newDisplayName").value,username:$("newUsername").value,password:$("newPassword").value})});$("addMemberForm").reset();$("memberFeedback").style.color="#16866d";$("memberFeedback").textContent="Ahli berjaya ditambah.";loadMembers();}catch(err){$("memberFeedback").style.color="#c0392b";$("memberFeedback").textContent=err.message;}});
(async()=>{try{const d=await api("/api/me");me=d.user;showApp();}catch{showLogin();}})();