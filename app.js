import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,createUserWithEmailAndPassword} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,setDoc,collection,addDoc,query,orderBy,limit,onSnapshot,serverTimestamp,updateDoc} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const cfg={apiKey:"AIzaSyDtHeH1-7HYr7ihyEUAIx0SM-Dv0uWY17Y",authDomain:"khairul-chat.firebaseapp.com",projectId:"khairul-chat",storageBucket:"khairul-chat.firebasestorage.app",messagingSenderId:"731162924012",appId:"1:731162924012:web:6639d9931a94b28044a6c9",measurementId:"G-XG0J5SBPS2"};
const ADMIN_UID="t44mtOdTbnUt1mep3ZIg6dYkD0C2";
const app=initializeApp(cfg),auth=getAuth(app),db=getFirestore(app);
const app2=initializeApp(cfg,"memberCreator"),auth2=getAuth(app2);
const $=id=>document.getElementById(id);
let user=null,profile=null,stopChat=null,stopUsers=null;
const err=e=>e?.message?.replace("Firebase: ","")||"Ralat sistem.";
$("loginForm").onsubmit=async e=>{e.preventDefault();$("loginError").textContent="";try{await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value)}catch(x){$("loginError").textContent=err(x)}};
$("logout").onclick=()=>signOut(auth);
$("sendForm").onsubmit=async e=>{e.preventDefault();let text=$("message").value.trim();if(!text)return;$("message").value="";try{await addDoc(collection(db,"messages"),{uid:user.uid,displayName:profile.displayName||user.email,text,createdAt:serverTimestamp()})}catch(x){alert(err(x));$("message").value=text}};
$("addMemberForm").onsubmit=async e=>{
 e.preventDefault();$("memberFeedback").textContent="Sedang mencipta akaun ahli...";
 const displayName=$("memberName").value.trim(),email=$("memberEmail").value.trim(),password=$("memberPassword").value;
 try{
  if(user.uid!==ADMIN_UID||profile.role!=="admin")throw Error("Hanya admin boleh tambah ahli.");
  const credential=await createUserWithEmailAndPassword(auth2,email,password);
  const newUid=credential.user.uid;
  await signOut(auth2);
  // Create the Firestore member profile using the primary, authenticated admin session.
  await setDoc(doc(db,"users",newUid),{displayName,email,role:"member",active:true,createdAt:serverTimestamp()});
  $("addMemberForm").reset();$("memberFeedback").style.color="#16866d";$("memberFeedback").textContent="Ahli berjaya ditambah. Berikan email dan password kepada ahli.";
 }catch(x){
  $("memberFeedback").style.color="#bd3737";$("memberFeedback").textContent=err(x);
  try{await signOut(auth2)}catch{}
 }
};
function show(){
 $("loginScreen").classList.add("hidden");$("chatApp").classList.remove("hidden");
 $("displayName").textContent=profile.displayName||user.email;$("roleText").textContent=profile.role;
 $("adminPanel").classList.toggle("hidden",profile.role!=="admin");
 if(stopChat)stopChat();
 stopChat=onSnapshot(query(collection(db,"messages"),orderBy("createdAt"),limit(150)),s=>{
  $("messages").innerHTML="";
  s.forEach(d=>{let m=d.data(),b=document.createElement("div");b.className="bubble"+(m.uid===user.uid?" mine":"");
   if(m.uid!==user.uid){let n=document.createElement("div");n.className="sender";n.textContent=m.displayName||"Ahli";b.append(n)}
   let t=document.createElement("div");t.textContent=m.text;b.append(t);
   let st=document.createElement("div");st.className="stamp";st.textContent=m.createdAt?.toDate?m.createdAt.toDate().toLocaleString("ms-MY"):"baru sahaja";b.append(st);$("messages").append(b)
  });$("messages").scrollTop=$("messages").scrollHeight;
 },e=>alert(err(e)));
 if(profile.role==="admin"){
  if(stopUsers)stopUsers();
  stopUsers=onSnapshot(collection(db,"users"),s=>{$("members").innerHTML="";s.forEach(d=>{
   let m=d.data();if(m.role!=="member")return;let row=document.createElement("div");row.className="member";
   row.textContent=(m.displayName||m.email)+" · "+(m.active===false?"Disekat":"Aktif");
   let btn=document.createElement("button");btn.textContent=m.active===false?"Aktifkan":"Sekat";
   btn.onclick=()=>updateDoc(doc(db,"users",d.id),{active:m.active===false}).catch(x=>alert(err(x)));
   row.append(btn);$("members").append(row);
  })},e=>alert(err(e)));
 }
}
onAuthStateChanged(auth,async u=>{
 user=u;if(!u){profile=null;$("loginScreen").classList.remove("hidden");$("chatApp").classList.add("hidden");if(stopChat)stopChat();if(stopUsers)stopUsers();return}
 try{
  const s=await getDoc(doc(db,"users",u.uid));if(!s.exists())throw Error("Profil ahli tiada. Minta admin semak akaun.");
  profile=s.data();if(profile.active===false)throw Error("Akaun anda telah disekat admin.");
  if(u.uid===ADMIN_UID&&profile.role!=="admin")throw Error("Profil admin perlu role admin.");
  show();
 }catch(x){alert(err(x));await signOut(auth)}
});