import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase.js";

const ETATS=["Bon état général","État moyen - maintenance préventive","Dégradé - intervention nécessaire","Critique - urgent","Vandalisé","Inaccessible"];
const TYPES=["SAV - Remise en service","SAV - Remplacement équipement","SAV - Recâblage","Maintenance préventive","Nettoyage / Réorganisation","Remplacement cassette(s)","Remplacement coupleur","Soudure(s) fibre","Rebrassage","Mesure optique","Intervention multi-SAV","MSA","Autre"];
const PROBS=["Fibres cassées","Connecteurs sales/endommagés","Cassettes mal rangées","Câbles non étiquetés","Boîtier endommagé","Infiltration d'eau","Coupleur défaillant","Soudures défectueuses","Câble sectionné","PM saturé","Vandalisme","Aucun problème"];
const REJECT_MSGS=["Photos manquantes","Mesures optiques incomplètes","Actions non détaillées","État box non renseigné","Checklist IW incomplète","Matériel non précisé","Observations insuffisantes"];

const pC=n=>n>=10?"red":n>=7?"orange":n>=5?"blue":"gray";
const pL=n=>n>=10?"Critique":n>=7?"Haute":n>=5?"Moyenne":"Basse";
const CL={a:"#e63946",dk:"#1a1a2e",bg:"#f4f3ef",cd:"#fff",bd:"#ddd6cc",sb:"#6b7280",wm:"#a39e93"};
const F="'DM Sans',sans-serif";

function B({children,color="blue"}){
  const m={blue:{b:"#dbeafe",t:"#1e40af"},orange:{b:"#ffedd5",t:"#c2410c"},red:{b:"#fee2e2",t:"#b91c1c"},green:{b:"#dcfce7",t:"#166534"},gray:{b:"#f1f5f9",t:"#475569"},purple:{b:"#f3e8ff",t:"#7c3aed"}};
  const c=m[color]||m.blue;
  return <span style={{display:"inline-block",padding:"2px 8px",borderRadius:12,fontSize:10,fontWeight:700,background:c.b,color:c.t,letterSpacing:.4,textTransform:"uppercase",whiteSpace:"nowrap"}}>{children}</span>;
}
const Logo=()=>(<svg width="34" height="34" viewBox="0 0 36 36" fill="none"><circle cx="18" cy="18" r="16" stroke="#fff" strokeWidth="2"/><circle cx="18" cy="18" r="12" stroke="#fff" strokeWidth="1.5"/><text x="18" y="22" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="bold" fontFamily="Arial">TS</text></svg>);

export default function App(){
  const [user,setUser]=useState(()=>{try{const s=sessionStorage.getItem("vdr_user");return s?JSON.parse(s):null;}catch{return null;}});
  const [loginCode,setLoginCode]=useState("");
  const [loginErr,setLoginErr]=useState("");
  const [loading,setLoading]=useState(true);

  const [pms,setPms]=useState([]);
  const [techs,setTechs]=useState([]);
  const [reps,setReps]=useState([]);
  const [assigns,setAssigns]=useState({});
  const [mgrCode,setMgrCode]=useState("1234");

  const [pg,setPg]=useState("dash");
  const [search,setSearch]=useState("");
  const [fDept,setFDept]=useState("all");
  const [fIW,setFIW]=useState("all");
  const [selPM,setSelPM]=useState(null);
  const [form,setForm]=useState(null);
  const [viewR,setViewR]=useState(null);
  const [newT,setNewT]=useState("");
  const [showAddT,setShowAddT]=useState(false);
  const [impMsg,setImpMsg]=useState("");
  const [showAss,setShowAss]=useState(null);
  const [assTypes,setAssTypes]=useState([]);
  const [newMgrCode,setNewMgrCode]=useState("");
  const [histSearch,setHistSearch]=useState("");
  const [histDateFrom,setHistDateFrom]=useState("");
  const [histDateTo,setHistDateTo]=useState("");
  const [resolvedSearch,setResolvedSearch]=useState("");
  const [localCodes,setLocalCodes]=useState({});
  const [iwItems,setIwItems]=useState([]);
  const [showIWPanel,setShowIWPanel]=useState(null); // pm code or null
  const [iwForm,setIwForm]=useState({ref_iw:"",cote_oc:"",cote_oi:"",commentaire:""});
  const [iwEditId,setIwEditId]=useState(null);
  const [lightbox,setLightbox]=useState(null);
  const [editingR,setEditingR]=useState(null); // report being edited or null
  const [submitting,setSubmitting]=useState(false); // lock for CR submission
  const [notifications,setNotifications]=useState([]);
  const [toast,setToast]=useState(null);
  const [fTech,setFTech]=useState("all"); // tech filter on dashboard
  const [showReject,setShowReject]=useState(null); // report to reject
  const [rejectPresets,setRejectPresets]=useState([]);
  const [rejectCustom,setRejectCustom]=useState("");
  const [messages,setMessages]=useState([]); // {message, count} or null
  const fileRef=useRef(null);
  const impRef=useRef(null);
  const reportRef=useRef(null);

  // Persist session across page reloads
  useEffect(()=>{try{if(user)sessionStorage.setItem("vdr_user",JSON.stringify(user));else sessionStorage.removeItem("vdr_user");}catch{}},[user]);

  // Compress photo to small thumbnail for draft storage
  const compressPhoto=(dataUrl,maxW=200)=>new Promise(resolve=>{
    try{
      const img=new window.Image();img.onload=()=>{
        const c=document.createElement("canvas");
        const scale=Math.min(maxW/img.width,maxW/img.height,1);
        c.width=img.width*scale;c.height=img.height*scale;
        c.getContext("2d").drawImage(img,0,0,c.width,c.height);
        resolve(c.toDataURL("image/jpeg",0.4));
      };img.onerror=()=>resolve(null);img.src=dataUrl;
    }catch{resolve(null);}
  });

  // Auto-save CR form draft with compressed photos
  useEffect(()=>{
    if(!form||pg!=="form")return;
    const saveDraft=async()=>{
      try{
        // Compress photos for draft storage
        let draftPhotos=[];
        if(form.photos?.length>0){
          const compressed=await Promise.all(form.photos.map(async p=>({label:p.label||"",data:await compressPhoto(p.data)||""})));
          draftPhotos=compressed.filter(p=>p.data);
        }
        const draft={...form,photos:draftPhotos,_photoCount:form.photos?.length||0};
        sessionStorage.setItem("vdr_draft",JSON.stringify(draft));
        if(selPM)sessionStorage.setItem("vdr_draft_pm",JSON.stringify(selPM));
      }catch(e){
        // If storage is full even with compressed photos, save without photos
        try{
          const draft={...form,photos:[],_photoCount:form.photos?.length||0};
          sessionStorage.setItem("vdr_draft",JSON.stringify(draft));
        }catch{}
      }
    };
    const timer=setTimeout(saveDraft,500); // debounce
    return()=>clearTimeout(timer);
  },[form,pg,selPM]);

  // Clear draft on successful submit or cancel
  const clearDraft=()=>{try{sessionStorage.removeItem("vdr_draft");sessionStorage.removeItem("vdr_draft_pm");}catch{}};
  const hasDraft=(pmCode)=>{try{const d=sessionStorage.getItem("vdr_draft");if(!d)return false;const p=JSON.parse(d);return p.pmCode===pmCode;}catch{return false;}};

  // ========== SUPABASE DATA LOADING ==========
  const loadAll = useCallback(async()=>{
    try{
      const [{data:pmData},{data:techData},{data:repData},{data:assData},{data:cfgData},{data:iwData},{data:notifData},{data:msgData}] = await Promise.all([
        supabase.from("pms").select("*").order("nb_iw",{ascending:false}),
        supabase.from("techs").select("*").order("name"),
        supabase.from("reports").select("*").order("created_at",{ascending:false}),
        supabase.from("assignments").select("*"),
        supabase.from("config").select("*"),
        supabase.from("iw_items").select("*").order("created_at",{ascending:true}),
        supabase.from("notifications").select("*").eq("read",false).order("created_at",{ascending:false}),
        supabase.from("messages").select("*").order("created_at",{ascending:false}),
      ]);
      // Only update state if data is valid (not null/undefined) — prevents flash
      if(pmData&&pmData.length>=0) setPms(pmData.map(p=>({code:p.code,dept:p.dept,adresse:p.adresse,nbIW:p.nb_iw,lat:p.lat,lng:p.lng,resolved:!!p.resolved,resolved_at:p.resolved_at||null,resolved_reason:p.resolved_reason||null})));
      if(techData&&techData.length>=0){setTechs(techData);setLocalCodes(prev=>{const o={...prev};techData.forEach(t=>{if(!(t.name in o))o[t.name]=t.code||"";});return o;});}
      if(repData&&repData.length>=0) setReps(repData.map(r=>({...r,pmCode:r.pm_code,pmAdresse:r.pm_adresse,pmDept:r.pm_dept,nbCli:r.nb_cli,suiviTxt:r.suivi_txt})));
      if(assData&&assData.length>=0){const a={};assData.forEach(x=>a[x.pm_code]={tech:x.tech_name,types:x.types||[]});setAssigns(a);}
      if(cfgData){const mc=cfgData.find(c=>c.key==="mgr_code");if(mc)setMgrCode(mc.value);}
      if(iwData&&iwData.length>=0) setIwItems(iwData);
      if(notifData) setNotifications(notifData);
      if(msgData) setMessages(msgData);
      // Only stop loading when we have valid data
      if(techData&&cfgData) setLoading(false);
    }catch(e){
      console.error("Load error:",e);
      // Even on error, stop loading after 10s to avoid infinite spinner
      setTimeout(()=>setLoading(false),2000);
    }
  },[]);

  useEffect(()=>{loadAll();},[loadAll]);

  // Realtime subscriptions - only on tables that need it, with long debounce
  const typingRef=useRef(false);
  const pgRef=useRef(pg);
  useEffect(()=>{pgRef.current=pg;},[pg]);
  const typingTimer=useRef(null);
  useEffect(()=>{
    const onFocusIn=(e)=>{if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT'){typingRef.current=true;clearTimeout(typingTimer.current);}};
    const onFocusOut=(e)=>{if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT'){typingTimer.current=setTimeout(()=>{typingRef.current=false;},3000);}};
    document.addEventListener('focusin',onFocusIn);
    document.addEventListener('focusout',onFocusOut);
    return ()=>{document.removeEventListener('focusin',onFocusIn);document.removeEventListener('focusout',onFocusOut);};
  },[]);
  useEffect(()=>{
    let timer=null;
    const debouncedLoad=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!typingRef.current&&pgRef.current!=="form")loadAll();},3000);};
    const ch = supabase.channel("all-changes")
      .on("postgres_changes",{event:"*",schema:"public",table:"pms"},debouncedLoad)
      .on("postgres_changes",{event:"*",schema:"public",table:"reports"},debouncedLoad)
      .on("postgres_changes",{event:"*",schema:"public",table:"assignments"},debouncedLoad)
      .on("postgres_changes",{event:"*",schema:"public",table:"iw_items"},debouncedLoad)
      .subscribe();
    return ()=>{clearTimeout(timer);supabase.removeChannel(ch);};
  },[loadAll]);

  // ========== SUPABASE MUTATIONS ==========
  const savePms=async(newPms)=>{
    const rows=newPms.map(p=>({code:p.code,dept:p.dept,adresse:p.adresse,nb_iw:p.nbIW}));
    await supabase.from("pms").upsert(rows,{onConflict:"code"});
    setPms(newPms);
  };

  const saveR=async(allReps)=>{setReps(allReps);};

  const insertReport=async(r)=>{
    // Compress all photos before sending to Supabase
    let photos=r.photos||[];
    if(photos.length>0){
      photos=await Promise.all(photos.map(async p=>({...p,data:await compressForStorage(p.data)})));
    }
    const row={id:r.id,pm_code:r.pmCode,pm_adresse:r.pmAdresse,pm_dept:r.pmDept,date:r.date,h1:r.h1,h2:r.h2,tech:r.tech,types:r.types,probs:r.probs,etat:r.etat,nb_cli:r.nbCli,mesures:JSON.stringify(r.mesures||[]),actions:r.actions,materiel:r.materiel,obs:r.obs,suivi:r.suivi,suivi_txt:r.suiviTxt,photos,iw_results:r.iwResults||[]};
    const{error}=await supabase.from("reports").insert(row);
    if(error){alert("❌ Erreur lors de l'enregistrement du CR : "+error.message);console.error("Insert report error:",error);return false;}
    setReps(prev=>[{...row,...r,pmCode:r.pmCode,pmAdresse:r.pmAdresse,pmDept:r.pmDept,nbCli:r.nbCli,suiviTxt:r.suiviTxt,validation:"pending",photos},...prev]);
    return true;
  };

  const updateReport=async(r)=>{
    // Compress all photos before sending to Supabase
    let photos=r.photos||[];
    if(photos.length>0){
      photos=await Promise.all(photos.map(async p=>({...p,data:await compressForStorage(p.data)})));
    }
    const updates={types:r.types,probs:r.probs,etat:r.etat,nb_cli:r.nbCli,mesures:JSON.stringify(r.mesures||[]),actions:r.actions,materiel:r.materiel,obs:r.obs,suivi:r.suivi,suivi_txt:r.suiviTxt,photos,iw_results:r.iwResults||[],h1:r.h1,h2:r.h2};
    const{error}=await supabase.from("reports").update(updates).eq("id",r.id);
    if(error){alert("❌ Erreur lors de la mise à jour du CR : "+error.message);return false;}
    setReps(prev=>prev.map(rep=>rep.id===r.id?{...rep,...updates,nbCli:r.nbCli,suiviTxt:r.suiviTxt,types:r.types,probs:r.probs,etat:r.etat,iwResults:r.iwResults}:rep));
    return true;
  };

  const delR=async(id)=>{
    await supabase.from("reports").delete().eq("id",id);
    setReps(reps.filter(r=>r.id!==id));
    if(viewR?.id===id)setViewR(null);
  };

  const addTech=async(name)=>{
    supabase.from("techs").insert({name,code:""});
    setTechs(prev=>[...prev,{name,code:""}].sort((a,b)=>a.name.localeCompare(b.name)));
  };

  const removeTech=async(name)=>{
    supabase.from("techs").delete().eq("name",name);
    supabase.from("assignments").delete().eq("tech_name",name);
    setTechs(prev=>prev.filter(t=>t.name!==name));
    setAssigns(prev=>{const na={...prev};Object.keys(na).forEach(k=>{if(na[k]?.tech===name)delete na[k];});return na;});
  };

  const updateTechCode=async(name,code)=>{
    await supabase.from("techs").update({code}).eq("name",name);
    setTechs(prev=>prev.map(t=>t.name===name?{...t,code}:t));
  };

  const assignTech=async(pmCode,techName,types)=>{
    if(!techName){await supabase.from("assignments").delete().eq("pm_code",pmCode);const na={...assigns};delete na[pmCode];setAssigns(na);}
    else{
      const t=types||assigns[pmCode]?.types||[];
      await supabase.from("assignments").upsert({pm_code:pmCode,tech_name:techName,types:t},{onConflict:"pm_code"});
      const na={...assigns};na[pmCode]={tech:techName,types:t};setAssigns(na);
      // Create notification for the tech
      await supabase.from("notifications").insert({id:`notif_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,tech_name:techName,pm_code:pmCode,type:"assignment",read:false});
      // If PM was resolved (cr_done), reactivate it
      const pm=pms.find(p=>p.code===pmCode);
      if(pm?.resolved){await supabase.from("pms").update({resolved:false,resolved_at:null,resolved_reason:null}).eq("code",pmCode);}
    }
    setShowAss(null);
  };

  const saveAssTypes=async(pmCode,types)=>{
    await supabase.from("assignments").update({types}).eq("pm_code",pmCode);
    setAssigns(prev=>({...prev,[pmCode]:{...prev[pmCode],types}}));
  };

  const saveMgrCode=async(code)=>{
    await supabase.from("config").upsert({key:"mgr_code",value:code},{onConflict:"key"});
    setMgrCode(code);setNewMgrCode("");
  };

  // ========== IW ITEMS CRUD (Manager) ==========
  const iwForPM=code=>iwItems.filter(iw=>iw.pm_code===code);

  const addIW=async(pmCode)=>{
    if(!iwForm.ref_iw.trim())return;
    const id=`iw_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const row={id,pm_code:pmCode,ref_iw:iwForm.ref_iw.trim(),cote_oc:iwForm.cote_oc.trim(),cote_oi:iwForm.cote_oi.trim(),commentaire:iwForm.commentaire.trim()};
    await supabase.from("iw_items").insert(row);
    setIwItems(prev=>[...prev,{...row,created_at:new Date().toISOString()}]);
    setIwForm({ref_iw:"",cote_oc:"",cote_oi:"",commentaire:""});
  };

  const updateIW=async(id)=>{
    await supabase.from("iw_items").update({ref_iw:iwForm.ref_iw.trim(),cote_oc:iwForm.cote_oc.trim(),cote_oi:iwForm.cote_oi.trim(),commentaire:iwForm.commentaire.trim()}).eq("id",id);
    setIwItems(prev=>prev.map(iw=>iw.id===id?{...iw,ref_iw:iwForm.ref_iw.trim(),cote_oc:iwForm.cote_oc.trim(),cote_oi:iwForm.cote_oi.trim(),commentaire:iwForm.commentaire.trim()}:iw));
    setIwForm({ref_iw:"",cote_oc:"",cote_oi:"",commentaire:""});setIwEditId(null);
  };

  const deleteIW=async(id)=>{
    await supabase.from("iw_items").delete().eq("id",id);
    setIwItems(prev=>prev.filter(iw=>iw.id!==id));
  };

  const startEditIW=(iw)=>{setIwEditId(iw.id);setIwForm({ref_iw:iw.ref_iw,cote_oc:iw.cote_oc||"",cote_oi:iw.cote_oi||"",commentaire:iw.commentaire||""});};
  const cancelEditIW=()=>{setIwEditId(null);setIwForm({ref_iw:"",cote_oc:"",cote_oi:"",commentaire:""});};

  // ========== REACTIVATE PM ==========
  const reactivatePM=async(code)=>{
    setPms(prev=>prev.map(p=>p.code===code?{...p,resolved:false,resolved_at:null,resolved_reason:null}:p));
    supabase.from("pms").update({resolved:false,resolved_at:null,resolved_reason:null}).eq("code",code);
  };

  // ========== DELETE PMS ==========
  const resetPms=async()=>{
    await supabase.from("assignments").delete().neq("pm_code","");
    await supabase.from("pms").delete().neq("code","");
    setPms([]);setAssigns({});
  };

  const resetAssignments=async()=>{
    await supabase.from("assignments").delete().neq("pm_code","");
    setAssigns({});
  };

  // ========== AUTH ==========
  const isM=user?.role==="manager";
  const isT=user?.role==="tech";
  const tName=user?.name||"";

  const doLogin=()=>{
    const code=loginCode.trim();
    if(!code){setLoginErr("Entrez un code");return;}
    if(code===mgrCode){setUser({role:"manager"});setLoginCode("");setLoginErr("");setPg("dash");return;}
    const found=techs.find(t=>t.code===code);
    if(found){setUser({role:"tech",name:found.name,code});setLoginCode("");setLoginErr("");setPg("dash");return;}
    setLoginErr("Code invalide");
  };

  // Show toast for unread notifications on login
  useEffect(()=>{
    if(!user)return;
    const toasts=[];
    if(isT&&tName){
      // Tech: assignment notifications
      const myNotifs=notifications.filter(n=>n.tech_name===tName&&!n.read);
      if(myNotifs.length>0){
        const pmCodes=myNotifs.map(n=>n.pm_code);
        toasts.push(`📌 ${myNotifs.length} nouveau${myNotifs.length>1?"x":""} PM : ${pmCodes.join(", ")}`);
        const ids=myNotifs.map(n=>n.id);
        supabase.from("notifications").update({read:true}).in("id",ids).then(()=>{
          setNotifications(prev=>prev.filter(n=>!ids.includes(n.id)));
        });
      }
      // Tech: rejection messages
      const unreadMsgs=messages.filter(m=>m.tech_name===tName&&m.type==="rejection"&&!m.read);
      if(unreadMsgs.length>0){
        toasts.push(`🔄 ${unreadMsgs.length} CR renvoyé${unreadMsgs.length>1?"s":""} à corriger`);
      }
    }
    if(isM){
      // Manager: pending CRs
      const pending=reps.filter(r=>r.validation==="pending").length;
      if(pending>0) toasts.push(`🟡 ${pending} CR en attente de validation`);
      // Manager: resubmitted CRs
      const resubs=messages.filter(m=>m.type==="resubmission"&&!m.read).length;
      if(resubs>0) toasts.push(`✏️ ${resubs} CR corrigé${resubs>1?"s":""} à revalider`);
    }
    if(toasts.length===0)return;
    setToast({message:toasts.join("\n")});
    const timer=setTimeout(()=>setToast(null),8000);
    return()=>clearTimeout(timer);
  },[user,isT,isM,tName,notifications,messages,reps]);

  // ========== GEOCODING ==========
  const geocodeAddress=async(adresse)=>{
    try{
      const resp=await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(adresse)}&limit=1`);
      const data=await resp.json();
      if(data.features?.length>0){const[lng,lat]=data.features[0].geometry.coordinates;return{lat,lng};}
    }catch(e){console.error("Geocode error:",e);}
    return{lat:null,lng:null};
  };

  const geocodeBatch=async(items)=>{
    const results=[];
    for(let i=0;i<items.length;i++){
      const{lat,lng}=await geocodeAddress(items[i].adresse);
      results.push({...items[i],lat,lng});
      if(i%5===4)await new Promise(r=>setTimeout(r,200));// rate limit
    }
    return results;
  };

  // ========== IMPORT ==========
  const [geoProgress,setGeoProgress]=useState("");
  const handleImport=e=>{
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=async ev=>{
      const lines=ev.target.result.split(/\r?\n/).filter(l=>l.trim());
      if(lines.length<2){setImpMsg("Fichier vide");return;}
      const hdr=lines[0].toLowerCase();
      let sep="\t";if(hdr.includes(";"))sep=";";else if(!hdr.includes("\t")&&hdr.includes(","))sep=",";
      const cols=lines[0].split(sep).map(c=>c.trim().toLowerCase().replace(/['"]/g,""));
      const iC=cols.findIndex(c=>c.includes("code")&&c.includes("pm"));
      const iD=cols.findIndex(c=>c.includes("départ")||c.includes("depart")||c.includes("dept")||(c.includes("code")&&c.includes("dep")));
      const iA=cols.findIndex(c=>c.includes("adresse"));
      const iN=cols.findIndex(c=>c.includes("nombre")||c.includes("intervention")||c.includes("iw"));
      if(iC===-1){setImpMsg("Colonne 'Code PM' non trouvée: "+cols.join(", "));return;}
      const np=[];
      for(let i=1;i<lines.length;i++){const v=lines[i].split(sep).map(x=>x.trim().replace(/^["']|["']$/g,""));if(v[iC])np.push({code:v[iC],dept:iD>=0?v[iD]||"":"",adresse:iA>=0?v[iA]||"":"",nbIW:iN>=0?parseInt(v[iN])||0:0});}
      if(!np.length){setImpMsg("Aucun PM valide");return;}

      // Geocode addresses
      setGeoProgress("Géocodage en cours... 0/"+np.length);
      const geoResults=[];
      for(let i=0;i<np.length;i++){
        const{lat,lng}=await geocodeAddress(np[i].adresse);
        geoResults.push({...np[i],lat,lng});
        setGeoProgress(`Géocodage... ${i+1}/${np.length}`);
        if(i%5===4)await new Promise(r=>setTimeout(r,150));
      }

      const rows=geoResults.map(p=>({code:p.code,dept:p.dept,adresse:p.adresse,nb_iw:p.nbIW,lat:p.lat,lng:p.lng,resolved:false,resolved_at:null}));
      const{error}=await supabase.from("pms").upsert(rows,{onConflict:"code"});
      if(error){setImpMsg("Erreur: "+error.message);setGeoProgress("");return;}

      // Mark PMs absent from new import as resolved
      const importedCodes=new Set(np.map(p=>p.code));
      const activePmsBefore=pms.filter(p=>!p.resolved);
      const toResolve=activePmsBefore.filter(p=>!importedCodes.has(p.code));
      let resolvedCount=0;
      if(toResolve.length>0){
        const now=new Date().toISOString();
        const resCodes=toResolve.map(p=>p.code);
        await supabase.from("pms").update({resolved:true,resolved_at:now}).in("code",resCodes);
        resolvedCount=toResolve.length;
      }

      const geocoded=geoResults.filter(p=>p.lat).length;
      setImpMsg(`${np.length} PM importés · ${geocoded} géocodés${resolvedCount>0?` · ${resolvedCount} PM résolus`:""}`);
      setGeoProgress("");
      await loadAll();
    };
    reader.readAsText(file);e.target.value="";
  };

  // Compress photo for storage (1200px max, JPEG 60%)
  const compressForStorage=(dataUrl,maxW=1200)=>new Promise(resolve=>{
    const img=new window.Image();img.onload=()=>{
      const c=document.createElement("canvas");
      const scale=Math.min(maxW/img.width,maxW/img.height,1);
      c.width=img.width*scale;c.height=img.height*scale;
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);
      resolve(c.toDataURL("image/jpeg",0.6));
    };img.onerror=()=>resolve(dataUrl);img.src=dataUrl;
  });

  const handlePhotos=e=>{Array.from(e.target.files).forEach(f=>{const rd=new FileReader();rd.onload=async ev=>{const compressed=await compressForStorage(ev.target.result);setForm(fm=>({...fm,photos:[...(fm.photos||[]),{name:f.name,data:compressed,label:""}]}));};rd.readAsDataURL(f);});e.target.value="";};
  const toggleArr=(field,val)=>setForm(f=>({...f,[field]:f[field].includes(val)?f[field].filter(v=>v!==val):[...f[field],val]}));

  // ========== NAVIGATION & ROUTE ==========
  const openWaze=(lat,lng)=>{window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,"_blank");};
  const openMaps=(lat,lng,label)=>{window.open(`https://maps.google.com/maps?q=${lat},${lng}&label=${encodeURIComponent(label||"")}`,"_blank");};
  const openMapsAddr=(addr)=>{window.open(`https://maps.google.com/maps?q=${encodeURIComponent(addr)}`,"_blank");};

  const haversine=(lat1,lng1,lat2,lng2)=>{
    const R=6371;const dLat=(lat2-lat1)*Math.PI/180;const dLng=(lng2-lng1)*Math.PI/180;
    const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  };

  const optimizeRoute=(pmList)=>{
    const geo=pmList.filter(p=>p.lat&&p.lng);
    if(geo.length<2)return geo;
    const visited=[geo[0]];const remaining=[...geo.slice(1)];
    while(remaining.length>0){
      const last=visited[visited.length-1];
      let nearest=0,minDist=Infinity;
      remaining.forEach((p,i)=>{const d=haversine(last.lat,last.lng,p.lat,p.lng);if(d<minDist){minDist=d;nearest=i;}});
      visited.push(remaining.splice(nearest,1)[0]);
    }
    return visited;
  };

  const [showRoute,setShowRoute]=useState(false);
  const [routeData,setRouteData]=useState([]);

  const calcRoute=(techName)=>{
    const techPms=activePms.filter(p=>assigns[p.code]?.tech===techName&&p.lat&&p.lng);
    const optimized=optimizeRoute(techPms);
    let totalDist=0;
    const data=optimized.map((p,i)=>{
      let dist=0;
      if(i>0)dist=haversine(optimized[i-1].lat,optimized[i-1].lng,p.lat,p.lng);
      totalDist+=dist;
      return{...p,stepDist:Math.round(dist*10)/10,totalDist:Math.round(totalDist*10)/10,step:i+1};
    });
    setRouteData(data);setShowRoute(true);
  };

  const activePms=pms.filter(p=>!p.resolved);
  const resolvedPms=pms.filter(p=>p.resolved);
  const depts=[...new Set(activePms.map(p=>p.dept).filter(Boolean))].sort();
  const myPms=isT?activePms.filter(pm=>assigns[pm.code]?.tech===tName):activePms;
  const filtered=myPms.filter(pm=>{
    const ms=pm.code.toLowerCase().includes(search.toLowerCase())||pm.adresse.toLowerCase().includes(search.toLowerCase());
    const md=fDept==="all"||pm.dept===fDept;
    const mi=fIW==="all"||(fIW==="10+"&&pm.nbIW>=10)||(fIW==="7-9"&&pm.nbIW>=7&&pm.nbIW<=9)||(fIW==="5-6"&&pm.nbIW>=5&&pm.nbIW<=6)||(fIW==="1-4"&&pm.nbIW>=1&&pm.nbIW<=4)||(fIW==="0"&&pm.nbIW===0);
    const mt=fTech==="all"||(fTech==="unassigned"?!assigns[pm.code]?.tech:assigns[pm.code]?.tech===fTech);
    return ms&&md&&mi&&mt;
  });
  const myReps=isT?reps.filter(r=>r.tech===tName):reps;
  const repsFor=code=>myReps.filter(r=>r.pmCode===code);

  const startCR=pm=>{
    // Check for saved draft on this PM
    try{
      const draftStr=sessionStorage.getItem("vdr_draft");
      if(draftStr){
        const draft=JSON.parse(draftStr);
        if(draft.pmCode===pm.code){
          // Restore draft — re-attach IW results from current IW items (manager may have updated)
          const pmIws=iwForPM(pm.code);
          const freshIW=pmIws.map(iw=>{
            const saved=(draft.iwResults||[]).find(d=>d.id===iw.id);
            return saved||{id:iw.id,ref_iw:iw.ref_iw,cote_oc:iw.cote_oc||"",cote_oi:iw.cote_oi||"",commentaire_mgr:iw.commentaire||"",status:"",commentaire_tech:"",etat_box:""};
          });
          setSelPM(pm);setForm({...draft,iwResults:freshIW,photos:draft.photos||[]});setPg("form");
          if(draft._photoCount>0&&(!draft.photos||draft.photos.length===0)){
            setTimeout(()=>alert(`ℹ️ Brouillon restauré.\n${draft._photoCount} photo(s) non sauvegardée(s) — veuillez les reprendre.`),300);
          }
          return;
        }
      }
    }catch{}
    // No draft — start fresh
    const pmIws=iwForPM(pm.code);
    const iwResults=pmIws.map(iw=>({id:iw.id,ref_iw:iw.ref_iw,cote_oc:iw.cote_oc||"",cote_oi:iw.cote_oi||"",commentaire_mgr:iw.commentaire||"",status:"",commentaire_tech:"",etat_box:""}));
    const assInfo=assigns[pm.code]||{};
    const assignedTypes=assInfo.types||[];
    setSelPM(pm);setForm({pmCode:pm.code,pmAdresse:pm.adresse,pmDept:pm.dept,date:new Date().toISOString().slice(0,10),h1:"",h2:"",tech:isT?tName:(assInfo.tech||""),types:assignedTypes,probs:[],etat:"",nbCli:0,mesures:[],actions:"",materiel:"",obs:"",photos:[],suivi:false,suiviTxt:"",iwResults});setPg("form");
  };
  const startEditCR=(r)=>{
    const pmCode=r.pmCode||r.pm_code||"";const pmAdresse=r.pmAdresse||r.pm_adresse||"";const pmDept=r.pmDept||r.pm_dept||"";
    const nbCli=r.nbCli||r.nb_cli||0;const suiviTxt=r.suiviTxt||r.suivi_txt||"";
    const iwRes=(r.iw_results||r.iwResults||[]).map(iw=>({...iw}));
    const fakePM={code:pmCode,adresse:pmAdresse,dept:pmDept,nbIW:pms.find(p=>p.code===pmCode)?.nbIW||0};
    setSelPM(fakePM);setEditingR(r);
    let parsedMesures=[];
    try{if(typeof r.mesures==="string"&&r.mesures.startsWith("["))parsedMesures=JSON.parse(r.mesures);else if(typeof r.mesures==="string"&&r.mesures.trim())parsedMesures=[{coupleur:1,valeur:r.mesures}];else if(Array.isArray(r.mesures))parsedMesures=r.mesures;}catch{parsedMesures=r.mesures?[{coupleur:1,valeur:r.mesures}]:[];}
    setForm({id:r.id,pmCode,pmAdresse,pmDept,date:r.date||"",h1:r.h1||"",h2:r.h2||"",tech:r.tech||"",types:r.types||[],probs:r.probs||[],etat:r.etat||"",nbCli,mesures:parsedMesures,actions:r.actions||"",materiel:r.materiel||"",obs:r.obs||"",photos:r.photos||[],suivi:!!r.suivi,suiviTxt,iwResults:iwRes});
    setViewR(null);setPg("form");
  };
  const submitCR=async()=>{
    if(submitting)return; // Prevent double-click
    setSubmitting(true);
    try{
    if(editingR){
      // Re-submitting after rejection or editing → reset to pending
      const ok=await updateReport({...form,id:editingR.id});
      if(!ok)return;
      setReps(prev=>prev.map(rep=>rep.id===editingR.id?{...rep,validation:"pending",rejection_msg:null}:rep));
      await supabase.from("reports").update({validation:"pending",rejection_msg:null}).eq("id",editingR.id);
      // Notify manager that tech has resubmitted
      if(editingR.validation==="rejected"){
        const msgId=`msg_${Date.now()}_resub`;
        const techN=form.tech||tName;
        const pmC=form.pmCode;
        setMessages(prev=>[{id:msgId,tech_name:techN,pm_code:pmC,report_id:editingR.id,type:"resubmission",message:`CR corrigé et ressoumis par ${techN} pour ${pmC}`,read:false,created_at:new Date().toISOString()},...prev]);
        setPms(prev=>prev.map(p=>p.code===pmC?{...p,resolved:true,resolved_reason:"pending_validation"}:p));
        await Promise.all([
          supabase.from("messages").insert({id:msgId,tech_name:techN,pm_code:pmC,report_id:editingR.id,type:"resubmission",message:`CR corrigé et ressoumis par ${techN} pour ${pmC}`,read:false}),
          supabase.from("pms").update({resolved:true,resolved_reason:"pending_validation"}).eq("code",pmC),
        ]);
      }
      clearDraft();setEditingR(null);setPg("hist");
    }else{
      const r={...form,id:Date.now(),created:new Date().toISOString()};
      const ok=await insertReport(r);
      if(!ok)return; // Don't mark PM if insert failed
      // Mark PM as pending validation
      const now=new Date().toISOString();
      setPms(prev=>prev.map(p=>p.code===form.pmCode?{...p,resolved:true,resolved_at:now,resolved_reason:"pending_validation"}:p));
      await Promise.all([
        supabase.from("reports").update({validation:"pending"}).eq("id",r.id),
        supabase.from("pms").update({resolved:true,resolved_at:now,resolved_reason:"pending_validation"}).eq("code",form.pmCode),
      ]);
      clearDraft();setPg("ok");
    }
    }finally{setSubmitting(false);}
  };

  // ========== VALIDATION (Manager) ==========
  const validateCR=async(r)=>{
    const pmCode=r.pmCode||r.pm_code;
    // Optimistic: update local state immediately
    setReps(prev=>prev.map(rep=>rep.id===r.id?{...rep,validation:"validated"}:rep));
    setPms(prev=>prev.map(p=>p.code===pmCode?{...p,resolved:true,resolved_reason:"cr_done"}:p));
    setAssigns(prev=>{const na={...prev};delete na[pmCode];return na;});
    setViewR(null);
    // Await Supabase writes to ensure they complete before realtime reloads
    await Promise.all([
      supabase.from("reports").update({validation:"validated"}).eq("id",r.id),
      supabase.from("pms").update({resolved_reason:"cr_done"}).eq("code",pmCode),
      supabase.from("assignments").delete().eq("pm_code",pmCode),
    ]);
  };

  const rejectCR=async(r)=>{
    const msg=[...rejectPresets,rejectCustom.trim()].filter(Boolean).join(" · ");
    if(!msg){alert("Ajoutez un motif de renvoi.");return;}
    const pmCode=r.pmCode||r.pm_code;
    const msgId=`msg_${Date.now()}`;
    // Optimistic: update local state immediately
    setReps(prev=>prev.map(rep=>rep.id===r.id?{...rep,validation:"rejected",rejection_msg:msg}:rep));
    setPms(prev=>prev.map(p=>p.code===pmCode?{...p,resolved:false,resolved_at:null,resolved_reason:null}:p));
    setMessages(prev=>[{id:msgId,tech_name:r.tech,pm_code:pmCode,report_id:r.id,type:"rejection",message:msg,read:false,created_at:new Date().toISOString()},...prev]);
    setShowReject(null);setRejectPresets([]);setRejectCustom("");
    setViewR(null);
    // Await Supabase writes
    await Promise.all([
      supabase.from("reports").update({validation:"rejected",rejection_msg:msg}).eq("id",r.id),
      supabase.from("pms").update({resolved:false,resolved_at:null,resolved_reason:null}).eq("code",pmCode),
      supabase.from("messages").insert({id:msgId,tech_name:r.tech,pm_code:pmCode,report_id:r.id,type:"rejection",message:msg,read:false}),
    ]);
  };

  // ========== LIGHTBOX ==========
  const openLightbox=(photos,index=0)=>setLightbox({photos,index});
  const closeLightbox=()=>setLightbox(null);
  const lbPrev=()=>setLightbox(lb=>({...lb,index:(lb.index-1+lb.photos.length)%lb.photos.length}));
  const lbNext=()=>setLightbox(lb=>({...lb,index:(lb.index+1)%lb.photos.length}));
  const lbDownload=()=>{if(!lightbox)return;const p=lightbox.photos[lightbox.index];const a=document.createElement("a");a.href=p.data;a.download=p.label||p.name||`photo_${lightbox.index+1}.jpg`;document.body.appendChild(a);a.click();document.body.removeChild(a);};
  const lbDownloadAll=()=>{if(!lightbox)return;lightbox.photos.forEach((p,i)=>{setTimeout(()=>{const a=document.createElement("a");a.href=p.data;a.download=p.label||p.name||`photo_${i+1}.jpg`;document.body.appendChild(a);a.click();document.body.removeChild(a);},i*300);});};

  useEffect(()=>{
    if(!lightbox)return;
    const h=e=>{if(e.key==="Escape")closeLightbox();if(e.key==="ArrowLeft")lbPrev();if(e.key==="ArrowRight")lbNext();};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[lightbox]);

  const Lightbox=()=>{
    if(!lightbox)return null;const p=lightbox.photos[lightbox.index];const multi=lightbox.photos.length>1;
    return(<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.92)",zIndex:9999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)"}} onClick={closeLightbox}>
      <div style={{position:"absolute",top:12,right:12,display:"flex",gap:8,zIndex:10001}}>
        <button onClick={e=>{e.stopPropagation();lbDownload();}} style={{padding:"8px 14px",borderRadius:8,border:"none",background:"rgba(255,255,255,.15)",color:"#fff",fontFamily:F,fontSize:12,fontWeight:700,cursor:"pointer"}}>⬇ Télécharger</button>
        {multi&&<button onClick={e=>{e.stopPropagation();lbDownloadAll();}} style={{padding:"8px 14px",borderRadius:8,border:"none",background:"rgba(255,255,255,.15)",color:"#fff",fontFamily:F,fontSize:12,fontWeight:700,cursor:"pointer"}}>⬇ Tout ({lightbox.photos.length})</button>}
        <button onClick={e=>{e.stopPropagation();closeLightbox();}} style={{width:38,height:38,borderRadius:8,border:"none",background:"rgba(255,255,255,.15)",color:"#fff",fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
      </div>
      {multi&&<button onClick={e=>{e.stopPropagation();lbPrev();}} style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",width:44,height:44,borderRadius:"50%",border:"none",background:"rgba(255,255,255,.12)",color:"#fff",fontSize:22,cursor:"pointer",zIndex:10001}}>‹</button>}
      {multi&&<button onClick={e=>{e.stopPropagation();lbNext();}} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",width:44,height:44,borderRadius:"50%",border:"none",background:"rgba(255,255,255,.12)",color:"#fff",fontSize:22,cursor:"pointer",zIndex:10001}}>›</button>}
      <div onClick={e=>e.stopPropagation()} style={{maxWidth:"90vw",maxHeight:"80vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <img src={p.data} style={{maxWidth:"90vw",maxHeight:"80vh",objectFit:"contain",borderRadius:8,boxShadow:"0 8px 40px rgba(0,0,0,.6)"}} alt={p.label||""}/>
      </div>
      <div style={{marginTop:12,textAlign:"center",zIndex:10001}}>
        {p.label&&<div style={{color:"#fff",fontFamily:F,fontSize:13,fontWeight:600,marginBottom:4}}>{p.label}</div>}
        {multi&&<div style={{color:"rgba(255,255,255,.5)",fontFamily:F,fontSize:12}}>{lightbox.index+1} / {lightbox.photos.length}</div>}
      </div>
    </div>);
  };

  // ========== EXPORT PDF ==========
  const exportPDF=(r)=>{
    const pmCode=r.pmCode||r.pm_code||"";const pmAdresse=r.pmAdresse||r.pm_adresse||"";const suiviTxt=r.suiviTxt||r.suivi_txt||"";const nbCli=r.nbCli||r.nb_cli||0;
    const dateStr=r.date?new Date(r.date).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}):"";const etat=typeof r.etat==="string"?r.etat:"";
    const photosHtml=(r.photos||[]).map(p=>`<div style="break-inside:avoid;text-align:center;margin-bottom:10px;"><img src="${p.data}" style="max-width:100%;max-height:250px;object-fit:contain;border-radius:6px;border:1px solid #ddd;"/>${p.label?`<div style="font-size:10px;color:#666;margin-top:3px;">${p.label}</div>`:""}</div>`).join("");
    const iwRes=r.iw_results||r.iwResults||[];
    const iwHtml=iwRes.length>0?`<div style="margin-bottom:14px;"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:6px;">📋 Checklist IW (${iwRes.filter(i=>i.status==="Fait").length}/${iwRes.length})</div>${iwRes.map(iw=>{const c=iw.status==="Fait"?"#dcfce7":iw.status==="Impossible"?"#f3e8ff":iw.status==="Pas fait"?"#fee2e2":"#f9f9f7";const bc=iw.status==="Fait"?"#059669":iw.status==="Impossible"?"#7c3aed":iw.status==="Pas fait"?"#dc2626":"#999";return`<div style="padding:6px 8px;margin-bottom:3px;border-radius:4px;background:${c};border-left:3px solid ${bc};font-size:11px;"><strong style="font-family:monospace;">${iw.ref_iw}</strong>${iw.cote_oc||iw.cote_oi?` · ${iw.cote_oc?`OC:${iw.cote_oc}`:""} ${iw.cote_oi?`OI:${iw.cote_oi}`:""}`:""}${iw.etat_box?` · <span style="font-weight:700;color:${iw.etat_box==="OK"?"#059669":"#dc2626"};">Box:${iw.etat_box}</span>`:""}  — <span style="font-weight:700;color:${bc};">${iw.status||"—"}</span>${iw.commentaire_tech?`<br/><span style="color:#1e40af;font-size:9px;">💬 Tech: ${iw.commentaire_tech}</span>`:""}</div>`;}).join("")}</div>`:"";
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>CR-${r.id} ${pmCode}</title><style>@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'DM Sans',sans-serif;padding:30px;color:#1a1a2e;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}.header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #e63946;padding-bottom:12px;margin-bottom:20px;}.logo{display:flex;align-items:center;gap:10px;}.logo-circle{width:40px;height:40px;border-radius:50%;background:#1a1a2e;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;}.title{font-size:16px;font-weight:800;}.subtitle{font-size:9px;color:#888;}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;background:#fafaf6;border-radius:8px;padding:14px;margin-bottom:16px;}.full{grid-column:1/-1;}.label{font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;}.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:9px;font-weight:700;text-transform:uppercase;}.badge-blue{background:#dbeafe;color:#1e40af;}.badge-red{background:#fee2e2;color:#b91c1c;}.badge-green{background:#dcfce7;color:#166534;}.badge-orange{background:#ffedd5;color:#c2410c;}.section{margin-bottom:14px;}.section-title{font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:6px;}.content-box{background:#fafaf6;padding:10px;border-radius:6px;white-space:pre-wrap;font-size:11px;border-left:3px solid #e63946;}.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px;}.footer{margin-top:30px;padding-top:12px;border-top:1px solid #ddd;font-size:9px;color:#999;text-align:center;}@media print{body{padding:20px;}@page{size:A4;margin:15mm;}}</style></head><body>
    <div class="header"><div class="logo"><div class="logo-circle">TS</div><div><div class="title">Compte Rendu</div><div class="subtitle">CR-${r.id}</div></div></div><div style="text-align:right;"><div style="font-weight:700;">${dateStr}</div>${r.h1?`<div style="color:#888;">${r.h1} → ${r.h2||"?"}</div>`:""}</div></div>
    <div class="info-grid"><div><div class="label">PM</div><div style="font-family:monospace;font-weight:800;">${pmCode}</div></div><div><div class="label">Technicien</div><div style="font-weight:700;">${r.tech||"?"}</div></div><div class="full"><div class="label">Adresse</div><div style="font-size:11px;">${pmAdresse}</div></div></div>
    <div class="section"><div class="section-title">Type</div>${(r.types||[]).map(t=>`<span class="badge badge-blue">${t}</span> `).join("")}</div>
    <div class="section"><div class="section-title">État</div><span class="badge ${etat.includes("Bon")?"badge-green":etat.includes("Critique")?"badge-red":"badge-orange"}">${etat||"N/A"}</span></div>
    ${(r.probs||[]).length>0?`<div class="section"><div class="section-title">Problèmes</div>${r.probs.map(p=>`<span class="badge badge-red">${p}</span> `).join("")}</div>`:""}
    ${r.obs?`<div class="section"><div class="section-title">Observations</div><div class="content-box">${r.obs}</div></div>`:""}
    ${nbCli>0?`<div class="section"><div class="section-title">Clients rétablis</div><span class="badge badge-green">${nbCli}</span></div>`:""}
    ${(()=>{let mes=r.mesures;try{if(typeof mes==="string"&&mes.startsWith("["))mes=JSON.parse(mes);}catch{}if(Array.isArray(mes)&&mes.length>0)return`<div class="section"><div class="section-title">Mesures optiques</div><div style="background:#f1f5f9;border-radius:4px;overflow:hidden;">${mes.map((m,i)=>`<div style="display:flex;padding:5px 10px;border-bottom:${i<mes.length-1?"1px solid #ddd":"none"};font-size:11px;"><strong style="min-width:90px;">Coupleur ${m.coupleur}</strong><span style="font-family:monospace;color:#1e40af;font-weight:600;">${m.valeur}</span></div>`).join("")}</div></div>`;if(typeof mes==="string"&&mes.trim())return`<div class="section"><div class="section-title">Mesures</div><div style="font-family:monospace;font-size:10px;background:#f1f5f9;padding:8px;border-radius:4px;white-space:pre-wrap;">${mes}</div></div>`;return"";})()}
    ${r.materiel?`<div class="section"><div class="section-title">Matériel</div><div style="font-size:11px;white-space:pre-wrap;">${r.materiel}</div></div>`:""}
    ${iwHtml}
    ${r.suivi?`<div style="background:#fef3c7;border:1.5px solid #f59e0b;border-radius:6px;padding:10px;margin-bottom:14px;"><div style="font-size:10px;font-weight:800;color:#92400e;">⚠️ SUIVI</div><div style="font-size:11px;color:#78350f;">${suiviTxt}</div></div>`:""}
    ${(r.photos||[]).length>0?`<div class="section"><div class="section-title">📸 Photos (${r.photos.length})</div><div class="photos">${photosHtml}</div></div>`:""}
    <div class="footer">VIE DE RÉSEAU — TechnoSmart · Généré le ${new Date().toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
    </body></html>`;
    const w=window.open("","_blank","width=800,height=900");if(w){w.document.write(html);w.document.close();setTimeout(()=>{w.print();},600);}
  };

  // ========== STYLES ==========
  const inp={width:"100%",padding:"9px 12px",borderRadius:6,border:`1.5px solid ${CL.bd}`,fontFamily:F,fontSize:14,outline:"none",background:"#fff",boxSizing:"border-box"};
  const b1={padding:"9px 20px",borderRadius:6,border:"none",background:CL.a,color:"#fff",fontFamily:F,fontSize:13,fontWeight:700,cursor:"pointer"};
  const b2={...b1,background:"transparent",color:CL.dk,border:`1.5px solid ${CL.bd}`};
  const crd={background:CL.cd,borderRadius:10,border:`1px solid ${CL.bd}`,padding:18,marginBottom:12};
  const lbl={fontFamily:F,fontSize:11,fontWeight:700,color:CL.sb,display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:.5};
  const sT={fontFamily:F,color:CL.dk,fontSize:14,fontWeight:700,margin:"0 0 14px",paddingBottom:6,borderBottom:`2px solid ${CL.a}`};

  // ========== LOADING ==========
  if(loading) return (
    <div style={{fontFamily:F,background:CL.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      <div style={{textAlign:"center"}}>
        <div style={{width:64,height:64,borderRadius:"50%",background:CL.dk,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}><Logo/></div>
        <h1 style={{fontFamily:F,fontSize:20,fontWeight:800,color:CL.dk,marginBottom:8}}>VIE DE RÉSEAU</h1>
        <div style={{fontFamily:F,fontSize:12,color:CL.sb}}>Connexion à la base de données...</div>
        <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
        <div style={{marginTop:16,width:40,height:4,borderRadius:2,background:CL.a,margin:"16px auto 0",animation:"pulse 1.5s ease infinite"}}/>
      </div>
    </div>
  );

  // ========== LOGIN ==========
  if(!user) return (
    <div style={{fontFamily:F,background:CL.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      <div style={{background:CL.cd,borderRadius:16,padding:40,width:380,maxWidth:"90%",textAlign:"center",border:`1px solid ${CL.bd}`,boxShadow:"0 8px 32px rgba(0,0,0,.08)"}}>
        <div style={{width:64,height:64,borderRadius:"50%",background:CL.dk,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}><Logo/></div>
        <h1 style={{fontFamily:F,fontSize:22,fontWeight:800,color:CL.dk,marginBottom:4,letterSpacing:1}}>VIE DE RÉSEAU</h1>
        <p style={{fontFamily:F,fontSize:11,color:CL.wm,marginBottom:24,textTransform:"uppercase",letterSpacing:.8}}>TechnoSmart</p>
        <div style={{marginBottom:16}}>
          <label style={{...lbl,textAlign:"left"}}>Code d'accès</label>
          <input type="password" value={loginCode} onChange={e=>{setLoginCode(e.target.value);setLoginErr("");}} onKeyDown={e=>{if(e.key==="Enter")doLogin();}} placeholder="••••" style={{...inp,fontSize:18,padding:"14px 16px",textAlign:"center",letterSpacing:6}} autoFocus/>
        </div>
        {loginErr&&<div style={{fontFamily:F,fontSize:12,color:"#dc2626",marginBottom:12}}>{loginErr}</div>}
        <button onClick={doLogin} style={{...b1,width:"100%",padding:12,fontSize:15}}>Connexion</button>
      </div>
    </div>
  );

  // ========== HEADER ==========
  const Head=()=>(
    <div style={{background:CL.dk,padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`3px solid ${CL.a}`,position:"sticky",top:0,zIndex:100}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <Logo/>
        <div>
          <div style={{color:"#fff",fontFamily:F,fontWeight:800,fontSize:15,letterSpacing:1.5,textTransform:"uppercase"}}>VIE DE RÉSEAU</div>
          <div style={{color:CL.wm,fontFamily:F,fontSize:9,textTransform:"uppercase"}}>{isM?"Espace Manager":`${tName}`}</div>
        </div>
      </div>
      <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
        {isM&&<><button onClick={()=>{setPg("dash");setViewR(null);setSearch("");}} style={{padding:"5px 10px",borderRadius:4,border:"none",background:pg==="dash"?CL.a:"rgba(255,255,255,.06)",color:pg==="dash"?"#fff":CL.wm,fontFamily:F,fontSize:10,fontWeight:700,cursor:"pointer"}}>📊 PM</button>
        <button onClick={()=>{setPg("import");}} style={{padding:"5px 10px",borderRadius:4,border:"none",background:pg==="import"?CL.a:"rgba(255,255,255,.06)",color:pg==="import"?"#fff":CL.wm,fontFamily:F,fontSize:10,fontWeight:700,cursor:"pointer"}}>📥 Import</button></>}
        {isT&&<button onClick={()=>{setPg("dash");setViewR(null);setSearch("");}} style={{padding:"5px 10px",borderRadius:4,border:"none",background:pg==="dash"?CL.a:"rgba(255,255,255,.06)",color:pg==="dash"?"#fff":CL.wm,fontFamily:F,fontSize:10,fontWeight:700,cursor:"pointer"}}>🏗️ Mes PM</button>}
        <button onClick={()=>{setPg("hist");setViewR(null);setSearch("");}} style={{padding:"5px 10px",borderRadius:4,border:"none",background:pg==="hist"?CL.a:"rgba(255,255,255,.06)",color:pg==="hist"?"#fff":CL.wm,fontFamily:F,fontSize:10,fontWeight:700,cursor:"pointer"}}>📋 CR</button>
        <button onClick={()=>{setPg("route");setShowRoute(false);}} style={{padding:"5px 10px",borderRadius:4,border:"none",background:pg==="route"?CL.a:"rgba(255,255,255,.06)",color:pg==="route"?"#fff":CL.wm,fontFamily:F,fontSize:10,fontWeight:700,cursor:"pointer"}}>🗺️ Tournée</button>
        {isT&&(()=>{const unread=messages.filter(m=>m.tech_name===tName&&!m.read).length;return <button onClick={()=>setPg("messages")} style={{padding:"5px 10px",borderRadius:4,border:"none",background:pg==="messages"?CL.a:"rgba(255,255,255,.06)",color:pg==="messages"?"#fff":CL.wm,fontFamily:F,fontSize:10,fontWeight:700,cursor:"pointer",position:"relative"}}>💬 Messages{unread>0&&<span style={{position:"absolute",top:-4,right:-4,width:16,height:16,borderRadius:"50%",background:"#dc2626",color:"#fff",fontSize:8,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{unread}</span>}</button>;})()}
        {isM&&(()=>{const pendingCR=reps.filter(r=>r.validation==="pending").length;const unreadMgr=messages.filter(m=>m.type==="resubmission"&&!m.read).length;const total=pendingCR+unreadMgr;return <button onClick={()=>setPg("messages")} style={{padding:"5px 10px",borderRadius:4,border:"none",background:pg==="messages"?CL.a:"rgba(255,255,255,.06)",color:pg==="messages"?"#fff":CL.wm,fontFamily:F,fontSize:10,fontWeight:700,cursor:"pointer",position:"relative"}}>💬 Suivi{total>0&&<span style={{position:"absolute",top:-4,right:-4,width:16,height:16,borderRadius:"50%",background:"#dc2626",color:"#fff",fontSize:8,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{total}</span>}</button>;})()}
        {isM&&<button onClick={()=>{setPg("team");}} style={{padding:"5px 10px",borderRadius:4,border:"none",background:pg==="team"?CL.a:"rgba(255,255,255,.06)",color:pg==="team"?"#fff":CL.wm,fontFamily:F,fontSize:10,fontWeight:700,cursor:"pointer"}}>👷 Équipe</button>}
        {isM&&<button onClick={()=>{setPg("resolved");setResolvedSearch("");}} style={{padding:"5px 10px",borderRadius:4,border:"none",background:pg==="resolved"?CL.a:"rgba(255,255,255,.06)",color:pg==="resolved"?"#fff":CL.wm,fontFamily:F,fontSize:10,fontWeight:700,cursor:"pointer"}}>✅ Résolus{resolvedPms.length>0?` (${resolvedPms.length})`:""}</button>}
        <button onClick={()=>setUser(null)} style={{padding:"5px 8px",borderRadius:4,border:"1px solid rgba(255,255,255,.2)",background:"transparent",color:"#fca5a5",fontFamily:F,fontSize:9,fontWeight:700,cursor:"pointer",marginLeft:4}}>⏏</button>
      </div>
    </div>
  );

  // ========== IMPORT ==========
  const ImportPg=()=>(<div style={{padding:16,maxWidth:700}}>
    <h2 style={{fontFamily:F,color:CL.dk,fontSize:18,fontWeight:800,marginBottom:14}}>📥 Import PM</h2>
    <div style={crd}>
      <input ref={impRef} type="file" accept=".csv,.tsv,.txt" onChange={handleImport} style={{display:"none"}}/>
      <button onClick={()=>impRef.current?.click()} style={{...b1,background:"#fff",color:CL.a,border:`2px dashed ${CL.a}`,width:"100%",padding:16,fontSize:13,marginBottom:10}}>📂 Sélectionner CSV / TSV</button>
      {impMsg&&<div style={{marginTop:8,padding:8,borderRadius:6,background:impMsg.includes("importé")?"#dcfce7":"#fee2e2",fontFamily:F,fontSize:12,fontWeight:600,color:impMsg.includes("importé")?"#166534":"#b91c1c"}}>{impMsg}</div>}
      {geoProgress&&<div style={{marginTop:8,padding:8,borderRadius:6,background:"#dbeafe",fontFamily:F,fontSize:12,fontWeight:600,color:"#1e40af"}}>{geoProgress}</div>}
    </div>
    <div style={crd}>
      <div style={{fontFamily:F,fontSize:13,color:CL.dk}}><strong>{activePms.length}</strong> PM actifs · <strong>{resolvedPms.length}</strong> résolus · <strong>{depts.length}</strong> depts</div>
      {pms.length>0&&<button onClick={()=>{if(window.confirm("Supprimer TOUS les PM et affectations ? Les CR sont conservés."))resetPms();}} style={{...b2,marginTop:10,fontSize:11,color:"#dc2626",borderColor:"#fca5a5"}}>🗑️ Réinitialiser</button>}
    </div>
  </div>);

  // ========== DASHBOARD ==========
  const Dash=()=>{
    const aff=Object.keys(assigns).filter(c=>activePms.some(p=>p.code===c)).length;
    const stats=isM?[{l:"PM actifs",v:activePms.length,i:"🏗️",c:"#2563eb"},{l:"IW",v:activePms.reduce((s,p)=>s+p.nbIW,0),i:"🔧",c:CL.a},{l:"CR",v:reps.length,i:"📝",c:"#059669"},{l:"Affectés",v:aff,i:"✅",c:"#7c3aed"},{l:"Non aff.",v:activePms.length-aff,i:"⚠️",c:activePms.length-aff>0?"#dc2626":"#059669"},{l:"Résolus",v:resolvedPms.length,i:"✅",c:"#059669",click:()=>setPg("resolved")}]
    :[{l:"Mes PM",v:myPms.length,i:"🏗️",c:"#2563eb"},{l:"IW",v:myPms.reduce((s,p)=>s+p.nbIW,0),i:"🔧",c:CL.a},{l:"Mes CR",v:myReps.length,i:"📝",c:"#059669"}];
    return(<div style={{padding:16}}>
      {myPms.length===0?(
        <div style={{textAlign:"center",padding:50}}><div style={{fontSize:50}}>{isM?"📥":"📭"}</div><h2 style={{fontFamily:F,color:CL.dk,fontSize:18,fontWeight:800,marginTop:12}}>{isM?"Aucun PM":"Aucun PM affecté"}</h2><p style={{fontFamily:F,color:CL.sb,marginTop:8}}>{isM?"Importez votre fichier.":"Contactez votre manager."}</p>{isM&&<button onClick={()=>setPg("import")} style={{...b1,marginTop:16}}>📥 Importer</button>}</div>
      ):(<>
      <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(stats.length,6)},1fr)`,gap:8,marginBottom:16}}>
        {stats.map((s,i)=>(<div key={i} onClick={s.click||undefined} style={{...crd,padding:10,display:"flex",alignItems:"center",gap:8,borderLeft:`4px solid ${s.c}`,marginBottom:0,cursor:s.click?"pointer":"default"}}><span style={{fontSize:20}}>{s.i}</span><div><div style={{fontSize:18,fontWeight:800,fontFamily:F,color:CL.dk}}>{s.v}</div><div style={{fontSize:8,color:CL.sb,fontFamily:F,textTransform:"uppercase"}}>{s.l}</div></div></div>))}
      </div>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <input placeholder="🔍 Rechercher..." value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,maxWidth:260,fontSize:13}}/>
        <select value={fDept} onChange={e=>setFDept(e.target.value)} style={{...inp,maxWidth:120,fontSize:13}}><option value="all">Tous depts</option>{depts.map(d=><option key={d} value={d}>{d}</option>)}</select>
        <select value={fIW} onChange={e=>setFIW(e.target.value)} style={{...inp,maxWidth:120,fontSize:13}}><option value="all">Tous IW</option><option value="10+">10+ (critique)</option><option value="7-9">7-9 (haute)</option><option value="5-6">5-6 (moyenne)</option><option value="1-4">1-4 (basse)</option><option value="0">0</option></select>
        {isM&&<select value={fTech} onChange={e=>setFTech(e.target.value)} style={{...inp,maxWidth:140,fontSize:13}}><option value="all">Tous techs</option><option value="unassigned">Non affectés</option>{techs.map(t=><option key={t.name} value={t.name}>{t.name}</option>)}</select>}
        {isM&&Object.keys(assigns).length>0&&<button onClick={()=>{if(window.confirm("Supprimer toutes les affectations (techs + types) ?\nLes PM et CR sont conservés."))resetAssignments();}} style={{...b2,padding:"6px 12px",fontSize:10,color:"#c2410c",borderColor:"#fed7aa",marginLeft:"auto"}}>🔄 Réinitialiser les affectations</button>}
      </div>
      <div style={{...crd,padding:0,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:isM?"2fr .5fr 2.5fr .6fr .7fr 1.4fr 1fr":"2.2fr .5fr 3fr .7fr .8fr 1fr",background:CL.dk,color:"#fff",fontFamily:F,fontSize:9,fontWeight:700,padding:"7px 10px",textTransform:"uppercase"}}>
          <div>Code</div><div>Dpt</div><div>Adresse</div><div style={{textAlign:"center"}}>IW</div><div style={{textAlign:"center"}}>Prio</div>{isM&&<div style={{textAlign:"center"}}>Tech</div>}<div style={{textAlign:"center"}}>Act.</div>
        </div>
        <div style={{maxHeight:400,overflowY:"auto"}}>
          {filtered.map((pm,i)=>(<div key={pm.code} style={{display:"grid",gridTemplateColumns:isM?"2fr .5fr 2.5fr .6fr .7fr 1.4fr 1fr":"2.2fr .5fr 3fr .7fr .8fr 1fr",padding:"6px 10px",fontFamily:F,fontSize:11,background:i%2===0?"#fff":"#fafaf6",borderBottom:`1px solid ${CL.bd}`,alignItems:"center"}}>
            <div style={{fontWeight:700,fontSize:10,fontFamily:"monospace",color:CL.dk}}>{pm.code}</div>
            <div style={{color:CL.sb,fontSize:10}}>{pm.dept}</div>
            <div style={{color:"#374151",fontSize:10}}>{pm.adresse}</div>
            <div style={{textAlign:"center",fontWeight:800,color:pm.nbIW>=10?"#dc2626":CL.dk,fontSize:12}}>{pm.nbIW}</div>
            <div style={{textAlign:"center"}}><B color={pC(pm.nbIW)}>{pL(pm.nbIW)}</B></div>
            {isM&&<div style={{textAlign:"center"}}>{assigns[pm.code]?.tech?<><B color="purple">{assigns[pm.code].tech}</B><button onClick={()=>{setShowAss(pm.code);setAssTypes(assigns[pm.code]?.types||[]);}} style={{border:"none",background:"transparent",cursor:"pointer",fontSize:8,marginLeft:2}}>✏️</button></>:<button onClick={()=>{setShowAss(pm.code);setAssTypes([]);}} style={{...b2,padding:"2px 6px",fontSize:8,color:"#7c3aed",borderColor:"#c4b5fd"}}>Affecter</button>}</div>}
            <div style={{textAlign:"center",display:"flex",gap:3,justifyContent:"center",flexWrap:"wrap"}}>
              <button onClick={()=>startCR(pm)} style={{...b1,padding:"3px 7px",fontSize:9,position:"relative"}}>{hasDraft(pm.code)?"📝 Reprendre":"+CR"}</button>
              {isM&&<button onClick={()=>{setShowIWPanel(pm.code);setIwForm({ref_iw:"",position:"",commentaire:""});setIwEditId(null);}} style={{...b2,padding:"2px 5px",fontSize:8,color:iwForPM(pm.code).length>0?"#059669":"#7c3aed",borderColor:iwForPM(pm.code).length>0?"#86efac":"#c4b5fd"}}>{iwForPM(pm.code).length>0?`📋${iwForPM(pm.code).length}`:"📋+"}</button>}
              {pm.lat?<button onClick={()=>openWaze(pm.lat,pm.lng)} style={{...b2,padding:"2px 5px",fontSize:8,color:"#33ccff",borderColor:"#33ccff"}}>📍</button>
              :<button onClick={()=>openMapsAddr(pm.adresse)} style={{...b2,padding:"2px 5px",fontSize:8}}>📍</button>}
              {repsFor(pm.code).length>0&&<button onClick={()=>{setPg("hist");setHistSearch(pm.code);}} style={{...b2,padding:"2px 5px",fontSize:8}}>📋{repsFor(pm.code).length}</button>}
            </div>
          </div>))}
        </div>
      </div></>)}
      {showAss&&isM&&(<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}} onClick={()=>setShowAss(null)}><div style={{background:"#fff",borderRadius:12,padding:20,width:400,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <h3 style={{fontFamily:F,color:CL.dk,fontSize:14,fontWeight:800,marginBottom:12}}>Affecter — {showAss}</h3>
        <div style={{marginBottom:14}}>
          <div style={lbl}>Technicien</div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {techs.map(t=><button key={t.name} onClick={()=>assignTech(showAss,t.name,assTypes)} style={{...b2,width:"100%",textAlign:"left",padding:"8px 12px",fontSize:13,fontWeight:assigns[showAss]?.tech===t.name?800:500,background:assigns[showAss]?.tech===t.name?"#f3e8ff":"#fff"}}>👷 {t.name}{assigns[showAss]?.tech===t.name?" ✓":""}</button>)}
          </div>
        </div>
        <div style={{marginBottom:14}}>
          <div style={lbl}>Type d'intervention *</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{TYPES.map(t=><button key={t} onClick={()=>{const nt=assTypes.includes(t)?assTypes.filter(x=>x!==t):[...assTypes,t];setAssTypes(nt);if(assigns[showAss]?.tech)saveAssTypes(showAss,nt);}} style={{padding:"4px 8px",borderRadius:14,border:`1.5px solid ${assTypes.includes(t)?CL.a:CL.bd}`,background:assTypes.includes(t)?"#fef2f2":"#fff",color:assTypes.includes(t)?CL.a:CL.sb,fontFamily:F,fontSize:10,fontWeight:600,cursor:"pointer"}}>{assTypes.includes(t)?"✓ ":""}{t}</button>)}</div>
        </div>
        {assigns[showAss]?.tech&&<button onClick={()=>assignTech(showAss,null)} style={{...b2,width:"100%",marginTop:4,fontSize:11,color:"#dc2626"}}>Retirer l'affectation</button>}
        <button onClick={()=>setShowAss(null)} style={{...b2,width:"100%",marginTop:6}}>Fermer</button>
      </div></div>)}
      {showIWPanel&&isM&&(<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}} onClick={()=>setShowIWPanel(null)}><div style={{background:"#fff",borderRadius:12,padding:20,width:440,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <h3 style={{fontFamily:F,color:CL.dk,fontSize:14,fontWeight:800,marginBottom:4}}>📋 Références IW — {showIWPanel}</h3>
        <p style={{fontFamily:F,fontSize:10,color:CL.sb,marginBottom:14}}>Le technicien devra cocher chaque IW lors du CR.</p>
        {iwForPM(showIWPanel).map(iw=>(
          <div key={iw.id} style={{padding:10,marginBottom:6,borderRadius:8,border:`1px solid ${CL.bd}`,background:iwEditId===iw.id?"#fffbeb":"#fafaf6"}}>
            {iwEditId===iw.id?<>
              <div style={{marginBottom:6}}><label style={lbl}>Réf IW (jeton) *</label><input value={iwForm.ref_iw} onChange={e=>setIwForm(f=>({...f,ref_iw:e.target.value}))} style={{...inp,fontSize:11,padding:"5px 8px"}}/></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
                <div><label style={lbl}>Côté OC</label><input value={iwForm.cote_oc} onChange={e=>setIwForm(f=>({...f,cote_oc:e.target.value}))} style={{...inp,fontSize:11,padding:"5px 8px"}}/></div>
                <div><label style={lbl}>Côté OI</label><input value={iwForm.cote_oi} onChange={e=>setIwForm(f=>({...f,cote_oi:e.target.value}))} style={{...inp,fontSize:11,padding:"5px 8px"}}/></div>
              </div>
              <div style={{marginBottom:6}}><label style={lbl}>Commentaire</label><input value={iwForm.commentaire} onChange={e=>setIwForm(f=>({...f,commentaire:e.target.value}))} style={{...inp,fontSize:11,padding:"5px 8px"}}/></div>
              <div style={{display:"flex",gap:4}}><button onClick={()=>updateIW(iw.id)} style={{...b1,padding:"4px 10px",fontSize:10}}>✓ Sauver</button><button onClick={cancelEditIW} style={{...b2,padding:"4px 10px",fontSize:10}}>Annuler</button></div>
            </>:<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontFamily:"monospace",fontSize:12,fontWeight:800,color:CL.dk}}>{iw.ref_iw}</div>
                {(iw.cote_oc||iw.cote_oi)&&<div style={{fontFamily:F,fontSize:9,color:CL.sb}}>{iw.cote_oc&&`OC: ${iw.cote_oc}`}{iw.cote_oc&&iw.cote_oi&&" · "}{iw.cote_oi&&`OI: ${iw.cote_oi}`}</div>}
                {iw.commentaire&&<div style={{fontFamily:F,fontSize:9,color:"#92400e",marginTop:2}}>💬 {iw.commentaire}</div>}
              </div>
              <div style={{display:"flex",gap:3}}>
                <button onClick={()=>startEditIW(iw)} style={{...b2,padding:"2px 6px",fontSize:8}}>✏️</button>
                <button onClick={()=>deleteIW(iw.id)} style={{...b2,padding:"2px 6px",fontSize:8,color:"#dc2626"}}>🗑️</button>
              </div>
            </div>}
          </div>
        ))}
        {iwForPM(showIWPanel).length===0&&<div style={{textAlign:"center",padding:16,color:CL.sb,fontFamily:F,fontSize:12}}>Aucune IW référencée.</div>}
        {!iwEditId&&<div style={{marginTop:10,padding:12,borderRadius:8,border:`2px dashed ${CL.a}`,background:"#fef2f2"}}>
          <div style={{fontFamily:F,fontSize:11,fontWeight:700,color:CL.a,marginBottom:8}}>+ Ajouter une IW</div>
          <div style={{marginBottom:6}}><label style={lbl}>Réf IW (jeton) *</label><input value={iwForm.ref_iw} onChange={e=>setIwForm(f=>({...f,ref_iw:e.target.value}))} placeholder="Ex: IW-2024-0142" style={{...inp,fontSize:11,padding:"5px 8px"}} onKeyDown={e=>{if(e.key==="Enter")addIW(showIWPanel);}}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
            <div><label style={lbl}>Côté OC</label><input value={iwForm.cote_oc} onChange={e=>setIwForm(f=>({...f,cote_oc:e.target.value}))} placeholder="Ex: P3-C2" style={{...inp,fontSize:11,padding:"5px 8px"}}/></div>
            <div><label style={lbl}>Côté OI</label><input value={iwForm.cote_oi} onChange={e=>setIwForm(f=>({...f,cote_oi:e.target.value}))} placeholder="Ex: P1-C4" style={{...inp,fontSize:11,padding:"5px 8px"}}/></div>
          </div>
          <div style={{marginBottom:6}}><label style={lbl}>Commentaire</label><input value={iwForm.commentaire} onChange={e=>setIwForm(f=>({...f,commentaire:e.target.value}))} placeholder="Note pour le tech..." style={{...inp,fontSize:11,padding:"5px 8px"}} onKeyDown={e=>{if(e.key==="Enter")addIW(showIWPanel);}}/></div>
          <button onClick={()=>addIW(showIWPanel)} disabled={!iwForm.ref_iw.trim()} style={{...b1,padding:"6px 14px",fontSize:11,opacity:iwForm.ref_iw.trim()?1:.4}}>+ Ajouter</button>
        </div>}
        <button onClick={()=>setShowIWPanel(null)} style={{...b2,width:"100%",marginTop:10}}>Fermer</button>
      </div></div>)}
    </div>);
  };

  // ========== FORM ==========
  const FormCR=()=>{
    if(!form)return null;
    const ok=form.tech&&form.types.length>0&&form.etat&&form.obs;
    const isEdit=!!editingR;
    return(<div style={{padding:16,maxWidth:800,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <button onClick={()=>{setPg(isEdit?"hist":"dash");if(isEdit)setEditingR(null);}} style={{...b2,fontSize:11}}>← {isEdit?"Retour au CR":"Retour"}</button>
        {!isEdit&&<div style={{fontFamily:F,fontSize:10,color:GREEN,fontWeight:600}}>💾 Brouillon sauvegardé</div>}
      </div>
      {isEdit&&<div style={{background:"#dbeafe",border:"1.5px solid #3b82f6",borderRadius:8,padding:10,marginBottom:12,fontFamily:F,fontSize:12,color:"#1e40af",fontWeight:700}}>✏️ Modification du CR-{editingR.id}</div>}
      <div style={{...crd,borderLeft:`4px solid ${isEdit?"#3b82f6":CL.a}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{fontFamily:F,fontWeight:800,fontSize:16,color:CL.dk}}>{form.pmCode}</div><div style={{fontFamily:F,fontSize:11,color:CL.sb,marginTop:2}}>{form.pmAdresse}</div></div>
        <div style={{textAlign:"right"}}><B color={pC(selPM.nbIW)}>{pL(selPM.nbIW)}</B><div style={{fontFamily:F,fontSize:10,color:CL.sb,marginTop:2}}>{selPM.nbIW} IW</div></div>
      </div>
      <div style={crd}><h3 style={sT}>📋 Infos</h3>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
          <div><label style={lbl}>Date{isEdit?" (verrouillé)":" *"}</label>{isEdit?<div style={{...inp,background:"#f4f3ef",fontWeight:700,color:CL.sb}}>{form.date}</div>:<input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inp}/>}</div>
          <div><label style={lbl}>Arrivée</label><input type="time" value={form.h1} onChange={e=>setForm(f=>({...f,h1:e.target.value}))} style={inp}/></div>
          <div><label style={lbl}>Départ</label><input type="time" value={form.h2} onChange={e=>setForm(f=>({...f,h2:e.target.value}))} style={inp}/></div>
        </div>
        {isEdit?<div style={{marginBottom:12}}><label style={lbl}>Technicien (verrouillé)</label><div style={{...inp,background:"#f4f3ef",fontWeight:700,color:CL.sb}}>{form.tech}</div></div>
        :isM?<div style={{marginBottom:12}}><label style={lbl}>Technicien *</label><select value={form.tech} onChange={e=>setForm(f=>({...f,tech:e.target.value}))} style={inp}><option value="">--</option>{techs.map(t=><option key={t.name} value={t.name}>{t.name}</option>)}</select></div>
        :<div style={{marginBottom:12}}><label style={lbl}>Technicien</label><div style={{...inp,background:"#f4f3ef",fontWeight:700}}>{tName}</div></div>}
        {isT&&!isEdit?<div style={{marginBottom:12}}><label style={lbl}>Type (défini par le manager)</label><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{form.types.length>0?form.types.map(t=><B key={t} color="blue">{t}</B>):<span style={{fontFamily:F,fontSize:11,color:CL.sb,fontStyle:"italic"}}>Aucun type défini</span>}</div></div>
        :<div style={{marginBottom:12}}><label style={lbl}>Type *</label><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{TYPES.map(t=><button key={t} onClick={()=>toggleArr("types",t)} style={{padding:"4px 8px",borderRadius:14,border:`1.5px solid ${form.types.includes(t)?CL.a:CL.bd}`,background:form.types.includes(t)?"#fef2f2":"#fff",color:form.types.includes(t)?CL.a:CL.sb,fontFamily:F,fontSize:10,fontWeight:600,cursor:"pointer"}}>{form.types.includes(t)?"✓ ":""}{t}</button>)}</div></div>}
        <div style={{marginBottom:12}}><label style={lbl}>Problèmes</label><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{PROBS.map(p=><button key={p} onClick={()=>toggleArr("probs",p)} style={{padding:"4px 8px",borderRadius:14,border:`1.5px solid ${form.probs.includes(p)?"#dc2626":CL.bd}`,background:form.probs.includes(p)?"#fef2f2":"#fff",color:form.probs.includes(p)?"#dc2626":CL.sb,fontFamily:F,fontSize:10,fontWeight:600,cursor:"pointer"}}>{form.probs.includes(p)?"✓ ":""}{p}</button>)}</div></div>
        <div style={{marginBottom:12}}><label style={lbl}>État *</label><select value={form.etat} onChange={e=>setForm(f=>({...f,etat:e.target.value}))} style={inp}><option value="">--</option>{ETATS.map(e=><option key={e} value={e}>{e}</option>)}</select></div>
        <div><label style={lbl}>Clients rétablis</label><input type="number" min="0" value={form.nbCli} onChange={e=>setForm(f=>({...f,nbCli:parseInt(e.target.value)||0}))} style={{...inp,maxWidth:90}}/></div>
      </div>
      <div style={crd}><h3 style={sT}>🔧 Technique</h3>
        <div style={{marginBottom:12}}><label style={lbl}>Observations *</label><textarea value={form.obs} onChange={e=>setForm(f=>({...f,obs:e.target.value}))} rows={3} style={{...inp,resize:"vertical"}}/></div>
        <div style={{marginBottom:12}}>
          <label style={lbl}>Mesures optiques</label>
          {(form.mesures||[]).map((m,i)=>(
            <div key={i} style={{display:"flex",gap:6,alignItems:"center",marginBottom:4}}>
              <span style={{fontFamily:F,fontSize:11,fontWeight:700,color:CL.dk,minWidth:85}}>Coupleur {m.coupleur}</span>
              <input value={m.valeur} onChange={e=>{const nm=[...form.mesures];nm[i]={...nm[i],valeur:e.target.value};setForm(f=>({...f,mesures:nm}));}} placeholder="Ex: -16 dBm" style={{...inp,flex:1,fontSize:12,padding:"6px 10px"}}/>
              <button onClick={()=>setForm(f=>({...f,mesures:f.mesures.filter((_,j)=>j!==i)}))} style={{...b2,padding:"3px 8px",fontSize:10,color:"#dc2626",flexShrink:0}}>✕</button>
            </div>
          ))}
          <button onClick={()=>setForm(f=>({...f,mesures:[...(f.mesures||[]),{coupleur:(f.mesures||[]).length+1,valeur:""}]}))} style={{...b2,padding:"5px 12px",fontSize:10,color:"#2563eb",borderColor:"#93c5fd",marginTop:4}}>+ Ajouter un coupleur</button>
        </div>
        <div style={{marginBottom:12}}><label style={lbl}>Matériel</label><textarea value={form.materiel} onChange={e=>setForm(f=>({...f,materiel:e.target.value}))} rows={2} style={{...inp,resize:"vertical"}}/></div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><input type="checkbox" checked={form.suivi} onChange={e=>setForm(f=>({...f,suivi:e.target.checked}))} style={{width:16,height:16,accentColor:CL.a}}/><label style={{fontFamily:F,fontSize:12,fontWeight:700}}>Suivi nécessaire</label></div>
        {form.suivi&&<textarea value={form.suiviTxt} onChange={e=>setForm(f=>({...f,suiviTxt:e.target.value}))} rows={2} style={{...inp,resize:"vertical"}}/>}
      </div>
      {form.iwResults?.length>0&&<div style={crd}><h3 style={sT}>📋 Checklist IW ({form.iwResults.filter(iw=>iw.status).length}/{form.iwResults.length})</h3>
        {form.iwResults.map((iw,i)=>{
          const stColors={Fait:"#059669","Pas fait":"#dc2626",Impossible:"#7c3aed"};
          return(<div key={iw.id} style={{padding:12,marginBottom:8,borderRadius:8,border:`1.5px solid ${iw.status?stColors[iw.status]||CL.bd:CL.bd}`,background:iw.status?(iw.status==="Fait"?"#f0fdf4":iw.status==="Impossible"?"#faf5ff":"#fef2f2"):"#fff"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div>
                <div style={{fontFamily:"monospace",fontSize:13,fontWeight:800,color:CL.dk}}>{iw.ref_iw}</div>
                {(iw.cote_oc||iw.cote_oi)&&<div style={{fontFamily:F,fontSize:10,color:CL.sb}}>{iw.cote_oc&&`OC: ${iw.cote_oc}`}{iw.cote_oc&&iw.cote_oi&&" · "}{iw.cote_oi&&`OI: ${iw.cote_oi}`}</div>}
              </div>
              <B color={iw.status==="Fait"?"green":iw.status==="Impossible"?"purple":iw.status==="Pas fait"?"red":"gray"}>{iw.status||"À traiter"}</B>
            </div>
            {iw.commentaire_mgr&&<div style={{fontFamily:F,fontSize:10,color:"#92400e",background:"#fef3c7",padding:"4px 8px",borderRadius:4,marginBottom:6}}>💬 Manager : {iw.commentaire_mgr}</div>}
            <div style={{display:"flex",gap:4,marginBottom:6,alignItems:"center",flexWrap:"wrap"}}>
              {["Fait","Pas fait","Impossible"].map(st=><button key={st} onClick={()=>{const nr=[...form.iwResults];nr[i]={...nr[i],status:st};setForm(f=>({...f,iwResults:nr}));}} style={{padding:"4px 10px",borderRadius:14,border:`1.5px solid ${iw.status===st?(stColors[st]||CL.bd):CL.bd}`,background:iw.status===st?(st==="Fait"?"#dcfce7":st==="Impossible"?"#f3e8ff":"#fee2e2"):"#fff",color:iw.status===st?(stColors[st]||CL.sb):CL.sb,fontFamily:F,fontSize:10,fontWeight:700,cursor:"pointer"}}>{iw.status===st?"✓ ":""}{st}</button>)}
              <select value={iw.etat_box||""} onChange={e=>{const nr=[...form.iwResults];nr[i]={...nr[i],etat_box:e.target.value};setForm(f=>({...f,iwResults:nr}));}} style={{...inp,width:80,fontSize:11,padding:"4px 6px",fontWeight:700,color:iw.etat_box==="OK"?"#059669":iw.etat_box==="NOK"?"#dc2626":CL.sb,background:iw.etat_box==="OK"?"#f0fdf4":iw.etat_box==="NOK"?"#fef2f2":"#fff"}}><option value="">Box...</option><option value="OK">✅ OK</option><option value="NOK">❌ NOK</option></select>
            </div>
            <input value={iw.commentaire_tech} onChange={e=>{const nr=[...form.iwResults];nr[i]={...nr[i],commentaire_tech:e.target.value};setForm(f=>({...f,iwResults:nr}));}} placeholder="Commentaire tech..." style={{...inp,fontSize:11,padding:"5px 8px"}}/>
          </div>);
        })}
      </div>}
      <div style={crd}><h3 style={sT}>📸 Photos</h3>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={handlePhotos} style={{display:"none"}}/>
        <button onClick={()=>fileRef.current?.click()} style={{...b1,background:"#fff",color:CL.a,border:`2px dashed ${CL.a}`,width:"100%",padding:14,marginBottom:10,fontSize:12}}>📷 Prendre / ajouter photos</button>
        {form.photos?.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>{form.photos.map((p,i)=><div key={i} style={{borderRadius:6,border:`1px solid ${CL.bd}`,overflow:"hidden"}}><div style={{position:"relative"}}><img src={p.data} onClick={()=>openLightbox(form.photos,i)} style={{width:"100%",height:90,objectFit:"cover",display:"block",cursor:"pointer"}} title="Cliquer pour agrandir"/><button onClick={()=>setForm(f=>({...f,photos:f.photos.filter((_,j)=>j!==i)}))} style={{position:"absolute",top:2,right:2,width:18,height:18,borderRadius:"50%",border:"none",background:"rgba(0,0,0,.6)",color:"#fff",fontSize:10,cursor:"pointer"}}>✕</button></div><div style={{padding:3}}><input value={p.label} onChange={e=>{const ph=[...form.photos];ph[i]={...ph[i],label:e.target.value};setForm(f=>({...f,photos:ph}));}} placeholder="Légende" style={{...inp,fontSize:9,padding:"2px 4px"}}/></div></div>)}</div>}
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginBottom:30}}>
        <button onClick={()=>{if(isEdit){setEditingR(null);setPg("hist");}else if(window.confirm("Abandonner ce CR ? Le brouillon sera supprimé.")){clearDraft();setForm(null);setPg("dash");}else{setPg("dash");}}} style={b2}>{isEdit?"Annuler":"🗑️ Abandonner"}</button>
        <button onClick={submitCR} disabled={!ok||submitting} style={{...b1,opacity:ok&&!submitting?1:.4,cursor:ok&&!submitting?"pointer":"not-allowed",padding:"10px 24px",fontSize:14,background:isEdit?"#1e40af":CL.a}}>{submitting?"⏳ Envoi en cours...":(isEdit?"💾 Enregistrer les modifications":"✅ Valider")}</button>
      </div>
    </div>);
  };

  const OkPg=()=>(<div style={{padding:20,maxWidth:400,margin:"50px auto",textAlign:"center"}}><div style={{fontSize:56}}>✅</div><h2 style={{fontFamily:F,color:CL.dk,fontSize:20,fontWeight:800,marginTop:12}}>CR enregistré !</h2><p style={{fontFamily:F,color:CL.sb,margin:"12px 0 20px"}}>PM: <strong>{form?.pmCode}</strong></p><div style={{display:"flex",gap:8,justifyContent:"center"}}><button onClick={()=>setPg("dash")} style={b2}>Dashboard</button><button onClick={()=>setPg("hist")} style={b1}>Voir CR</button></div></div>);

  // ========== VIEW REPORT ==========
  const VR=({r})=>{
    if(!r)return null;
    const etat=typeof r.etat==="string"?r.etat:"";
    const dateStr=r.date?new Date(r.date).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}):"";
    const pmCode=r.pmCode||r.pm_code||"";
    const pmAdresse=r.pmAdresse||r.pm_adresse||"";
    const suiviTxt=r.suiviTxt||r.suivi_txt||"";
    const nbCli=r.nbCli||r.nb_cli||0;
    const validation=r.validation||"pending";
    return(<div style={{padding:16,maxWidth:800,margin:"0 auto"}}><div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}><button onClick={()=>setViewR(null)} style={{...b2,fontSize:11}}>← Retour</button><button onClick={()=>exportPDF(r)} style={{...b1,fontSize:11,padding:"6px 14px",background:"#1e40af"}}>📄 Export PDF</button>{isM&&<button onClick={()=>startEditCR(r)} style={{...b1,fontSize:11,padding:"6px 14px",background:"#7c3aed"}}>✏️ Modifier</button>}{isM&&validation==="pending"&&<><button onClick={()=>validateCR(r)} style={{...b1,fontSize:11,padding:"6px 14px",background:"#059669"}}>✅ Valider</button><button onClick={()=>{setShowReject(r);setRejectPresets([]);setRejectCustom("");}} style={{...b1,fontSize:11,padding:"6px 14px",background:"#dc2626"}}>🔄 Renvoyer</button></>}{isT&&validation==="rejected"&&<button onClick={()=>startEditCR(r)} style={{...b1,fontSize:11,padding:"6px 14px",background:"#f59e0b"}}>✏️ Corriger et resoumettre</button>}</div>
    {validation==="pending"&&<div style={{background:"#fef3c7",border:"1.5px solid #f59e0b",borderRadius:8,padding:10,marginBottom:12,fontFamily:F,fontSize:12,color:"#92400e",fontWeight:700}}>🟡 En attente de validation par le manager</div>}
    {validation==="validated"&&<div style={{background:"#dcfce7",border:"1.5px solid #22c55e",borderRadius:8,padding:10,marginBottom:12,fontFamily:F,fontSize:12,color:"#166534",fontWeight:700}}>✅ CR validé</div>}
    {validation==="rejected"&&<div style={{background:"#fee2e2",border:"1.5px solid #ef4444",borderRadius:8,padding:10,marginBottom:12,fontFamily:F,fontSize:12,color:"#b91c1c",fontWeight:700}}>🔄 CR renvoyé — {r.rejection_msg||""}</div>}
    <div style={{...crd,border:`2px solid ${CL.a}`}}>
      <div style={{display:"flex",justifyContent:"space-between",borderBottom:`2px solid ${CL.a}`,paddingBottom:10,marginBottom:14}}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}><Logo/><div><div style={{fontFamily:F,fontWeight:800,fontSize:15}}>Compte Rendu</div><div style={{fontFamily:F,fontSize:9,color:CL.sb}}>CR-{r.id}</div></div></div>
        <div style={{textAlign:"right"}}><div style={{fontFamily:F,fontSize:12,fontWeight:700}}>{dateStr}</div>{r.h1&&<div style={{fontFamily:F,fontSize:10,color:CL.sb}}>{r.h1}→{r.h2||"?"}</div>}</div>
      </div>
      <div style={{background:"#fafaf6",borderRadius:8,padding:10,marginBottom:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
        <div><span style={lbl}>PM</span><div style={{fontFamily:"monospace",fontSize:12,fontWeight:800}}>{pmCode}</div></div>
        <div><span style={lbl}>Tech</span><div style={{fontFamily:F,fontSize:12,fontWeight:700}}>{r.tech||"?"}</div></div>
        <div style={{gridColumn:"1/-1"}}><span style={lbl}>Adresse</span><div style={{fontFamily:F,fontSize:11}}>{pmAdresse}</div></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <div><div style={{...lbl,marginBottom:3}}>Type</div><div style={{display:"flex",flexWrap:"wrap",gap:2}}>{(r.types||[]).map(t=><B key={t} color="blue">{t}</B>)}</div></div>
        <div><div style={{...lbl,marginBottom:3}}>État</div><B color={etat.includes("Bon")?"green":etat.includes("Critique")?"red":"orange"}>{etat||"N/A"}</B></div>
      </div>
      {r.probs?.length>0&&<div style={{marginBottom:12}}><div style={{...lbl,marginBottom:3}}>Problèmes</div><div style={{display:"flex",flexWrap:"wrap",gap:2}}>{r.probs.map(p=><B key={p} color="red">{p}</B>)}</div></div>}
      {r.obs&&<div style={{marginBottom:12}}><div style={{...lbl,marginBottom:3}}>Observations</div><div style={{fontFamily:F,fontSize:12,background:"#fafaf6",padding:8,borderRadius:6,whiteSpace:"pre-wrap",borderLeft:`3px solid ${CL.a}`}}>{r.obs}</div></div>}
      {nbCli>0&&<div style={{marginBottom:10}}><span style={lbl}>Clients: </span><B color="green">{nbCli}</B></div>}
      {(()=>{let mes=r.mesures;try{if(typeof mes==="string"&&mes.startsWith("["))mes=JSON.parse(mes);}catch{}if(Array.isArray(mes)&&mes.length>0)return<div style={{marginBottom:10}}><div style={lbl}>Mesures optiques</div><div style={{background:"#f1f5f9",borderRadius:6,overflow:"hidden"}}>{mes.map((m,i)=><div key={i} style={{display:"flex",padding:"5px 10px",borderBottom:i<mes.length-1?`1px solid ${CL.bd}`:"none",fontFamily:F,fontSize:11}}><span style={{fontWeight:700,minWidth:90,color:CL.dk}}>Coupleur {m.coupleur}</span><span style={{fontFamily:"monospace",color:"#1e40af",fontWeight:600}}>{m.valeur}</span></div>)}</div></div>;if(typeof mes==="string"&&mes.trim())return<div style={{marginBottom:10}}><div style={lbl}>Mesures</div><div style={{fontFamily:"monospace",fontSize:10,background:"#f1f5f9",padding:6,borderRadius:4,whiteSpace:"pre-wrap"}}>{mes}</div></div>;return null;})()}
      {r.materiel&&<div style={{marginBottom:10}}><div style={lbl}>Matériel</div><div style={{fontFamily:F,fontSize:11,whiteSpace:"pre-wrap"}}>{r.materiel}</div></div>}
      {(r.iw_results||r.iwResults||[]).length>0&&<div style={{marginBottom:12}}>
        <div style={{...lbl,marginBottom:6}}>📋 Checklist IW ({(r.iw_results||r.iwResults).filter(iw=>iw.status==="Fait").length}/{(r.iw_results||r.iwResults).length})</div>
        {(r.iw_results||r.iwResults).map(iw=>{
          const stC={Fait:"#059669","Pas fait":"#dc2626",Impossible:"#7c3aed"};
          return(<div key={iw.id||iw.ref_iw} style={{padding:8,marginBottom:4,borderRadius:6,border:`1px solid ${stC[iw.status]||CL.bd}`,background:iw.status==="Fait"?"#f0fdf4":iw.status==="Impossible"?"#faf5ff":iw.status==="Pas fait"?"#fef2f2":"#f9f9f7"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><span style={{fontFamily:"monospace",fontSize:11,fontWeight:800}}>{iw.ref_iw}</span>{(iw.cote_oc||iw.cote_oi)&&<span style={{fontFamily:F,fontSize:9,color:CL.sb,marginLeft:6}}>{iw.cote_oc&&`OC:${iw.cote_oc}`}{iw.cote_oc&&iw.cote_oi&&" · "}{iw.cote_oi&&`OI:${iw.cote_oi}`}</span>}</div>
              <div style={{display:"flex",gap:4,alignItems:"center"}}>{iw.etat_box&&<B color={iw.etat_box==="OK"?"green":"red"}>Box: {iw.etat_box}</B>}<B color={iw.status==="Fait"?"green":iw.status==="Impossible"?"purple":iw.status==="Pas fait"?"red":"gray"}>{iw.status||"—"}</B></div>
            </div>
            {iw.commentaire_mgr&&<div style={{fontFamily:F,fontSize:9,color:"#92400e",marginTop:3}}>💬 Mgr: {iw.commentaire_mgr}</div>}
            {iw.commentaire_tech&&<div style={{fontFamily:F,fontSize:9,color:"#1e40af",marginTop:2}}>💬 Tech: {iw.commentaire_tech}</div>}
          </div>);
        })}
      </div>}
      {r.suivi&&<div style={{background:"#fef3c7",border:"1.5px solid #f59e0b",borderRadius:6,padding:8,marginBottom:10}}><div style={{fontFamily:F,fontSize:10,fontWeight:800,color:"#92400e"}}>⚠️ SUIVI</div><div style={{fontFamily:F,fontSize:11,color:"#78350f"}}>{suiviTxt}</div></div>}
      {r.photos?.length>0&&<div><div style={{...lbl,marginBottom:6}}>📸 Photos ({r.photos.length})</div><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>{r.photos.map((p,i)=><div key={i} onClick={()=>openLightbox(r.photos,i)} style={{borderRadius:4,overflow:"hidden",border:`1px solid ${CL.bd}`,cursor:"pointer",transition:"transform .15s,box-shadow .15s"}} onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.03)";e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.15)";}} onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="none";}}><img src={p.data} style={{width:"100%",height:90,objectFit:"cover",display:"block"}}/>{p.label&&<div style={{padding:2,fontFamily:F,fontSize:9,color:CL.sb,textAlign:"center"}}>{p.label}</div>}</div>)}</div></div>}
    </div></div>);
  };

  // ========== HISTORIQUE ==========
  const exportIWListing=(crList)=>{
    const rows=[["Code PM","Dept","Tech","Date","Réf IW (Jeton)","Côté OC","Côté OI","Statut","État Box","Commentaire Manager","Commentaire Tech"]];
    crList.forEach(r=>{
      const pmCode=r.pmCode||r.pm_code||"";const pmDept=r.pmDept||r.pm_dept||"";const dateStr=r.date||"";
      (r.iw_results||r.iwResults||[]).forEach(iw=>{
        rows.push([pmCode,pmDept,r.tech||"",dateStr,iw.ref_iw||"",iw.cote_oc||"",iw.cote_oi||"",iw.status||"",iw.etat_box||"",iw.commentaire_mgr||"",iw.commentaire_tech||""]);
      });
    });
    if(rows.length<=1){alert("Aucune IW à exporter.");return;}
    const csv=rows.map(r=>r.map(c=>`"${(c+"").replace(/"/g,'""')}"`).join(";")).join("\n");
    const bom="\uFEFF";
    const blob=new Blob([bom+csv],{type:"text/csv;charset=utf-8;"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`listing_iw_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();document.body.removeChild(a);
  };

  const Hist=()=>{
    const fl=myReps.filter(r=>{
      const s=histSearch.toLowerCase();
      const matchSearch=!histSearch||(r.pmCode||r.pm_code||"").toLowerCase().includes(s)||(r.tech||"").toLowerCase().includes(s);
      const rDate=r.date||"";
      const matchFrom=!histDateFrom||rDate>=histDateFrom;
      const matchTo=!histDateTo||rDate<=histDateTo;
      return matchSearch&&matchFrom&&matchTo;
    });
    const totalCli=fl.reduce((s,r)=>(r.nbCli||r.nb_cli||0)+s,0);
    const totalIW=fl.reduce((s,r)=>(r.iw_results||r.iwResults||[]).length+s,0);
    const totalIWDone=fl.reduce((s,r)=>(r.iw_results||r.iwResults||[]).filter(i=>i.status==="Fait").length+s,0);

    if(viewR)return VR({r:viewR});
    return(<div style={{padding:16}}>
      <h2 style={{fontFamily:F,color:CL.dk,fontSize:18,fontWeight:800,marginBottom:12}}>{isT?"Mes CR":"Tous les CR"}</h2>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"flex-end"}}>
        <input placeholder="🔍 PM, tech..." value={histSearch} onChange={e=>setHistSearch(e.target.value)} style={{...inp,maxWidth:200,fontSize:12}}/>
        <div><label style={{...lbl,marginBottom:2}}>Du</label><input type="date" value={histDateFrom} onChange={e=>setHistDateFrom(e.target.value)} style={{...inp,fontSize:11,padding:"6px 8px",width:140}}/></div>
        <div><label style={{...lbl,marginBottom:2}}>Au</label><input type="date" value={histDateTo} onChange={e=>setHistDateTo(e.target.value)} style={{...inp,fontSize:11,padding:"6px 8px",width:140}}/></div>
        {(histDateFrom||histDateTo)&&<button onClick={()=>{setHistDateFrom("");setHistDateTo("");}} style={{...b2,padding:"6px 10px",fontSize:10}}>✕ Reset</button>}
        {fl.length>0&&<button onClick={()=>exportIWListing(fl)} style={{...b1,padding:"6px 12px",fontSize:10,background:"#059669",marginLeft:"auto"}}>📥 Export listing IW</button>}
      </div>
      {fl.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
        <div style={{...crd,padding:8,marginBottom:0,borderLeft:"4px solid #2563eb",display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:16}}>📝</span><div><div style={{fontSize:16,fontWeight:800,fontFamily:F}}>{fl.length}</div><div style={{fontSize:8,color:CL.sb,fontFamily:F,textTransform:"uppercase"}}>CR</div></div></div>
        <div style={{...crd,padding:8,marginBottom:0,borderLeft:"4px solid #059669",display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:16}}>👥</span><div><div style={{fontSize:16,fontWeight:800,fontFamily:F}}>{totalCli}</div><div style={{fontSize:8,color:CL.sb,fontFamily:F,textTransform:"uppercase"}}>Clients</div></div></div>
        <div style={{...crd,padding:8,marginBottom:0,borderLeft:"4px solid #7c3aed",display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:16}}>📋</span><div><div style={{fontSize:16,fontWeight:800,fontFamily:F}}>{totalIW}</div><div style={{fontSize:8,color:CL.sb,fontFamily:F,textTransform:"uppercase"}}>IW total</div></div></div>
        <div style={{...crd,padding:8,marginBottom:0,borderLeft:"4px solid #059669",display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:16}}>✅</span><div><div style={{fontSize:16,fontWeight:800,fontFamily:F}}>{totalIWDone}</div><div style={{fontSize:8,color:CL.sb,fontFamily:F,textTransform:"uppercase"}}>IW faits</div></div></div>
      </div>}
      {fl.length===0?<div style={{textAlign:"center",padding:40,color:CL.sb,fontFamily:F}}>📭 Aucun CR.</div>:
        fl.map(r=>{
          const etat=typeof r.etat==="string"?r.etat:"";
          const dateStr=r.date?new Date(r.date).toLocaleDateString("fr-FR"):"";
          const nbCli=r.nbCli||r.nb_cli||0;
          const iwRes=r.iw_results||r.iwResults||[];
          const iwDone=iwRes.filter(i=>i.status==="Fait").length;
          return(<div key={r.id} style={{...crd,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={()=>setViewR(r)}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2,flexWrap:"wrap"}}>
              <span style={{fontFamily:F,fontWeight:800,fontSize:12}}>{r.pmCode||r.pm_code}</span>
              <B color={etat.includes("Bon")?"green":etat.includes("Critique")?"red":"orange"}>{etat||"N/A"}</B>
              {(r.validation==="pending"||!r.validation)&&<B color="orange">🟡</B>}
              {r.validation==="validated"&&<B color="green">✅</B>}
              {r.validation==="rejected"&&<B color="red">🔄</B>}
              {r.suivi&&<B color="orange">⚠️</B>}
              {r.photos?.length>0&&<B color="gray">📸{r.photos.length}</B>}
              {nbCli>0&&<B color="green">👥 {nbCli}</B>}
              {iwRes.length>0&&<B color={iwDone===iwRes.length?"green":"purple"}>📋 {iwDone}/{iwRes.length}</B>}
            </div>
            <div style={{fontFamily:F,fontSize:10,color:CL.sb}}>👷 {r.tech||"?"} · {dateStr}</div>
            {iwRes.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>{iwRes.map((iw,j)=><span key={j} style={{fontFamily:"monospace",fontSize:8,padding:"1px 5px",borderRadius:8,background:iw.status==="Fait"?"#dcfce7":iw.status==="Pas fait"?"#fee2e2":iw.status==="Impossible"?"#f3e8ff":"#f1f5f9",color:iw.status==="Fait"?"#059669":iw.status==="Pas fait"?"#dc2626":iw.status==="Impossible"?"#7c3aed":"#999",fontWeight:700}}>{iw.ref_iw} {iw.status==="Fait"?"✓":iw.status==="Pas fait"?"✗":iw.status==="Impossible"?"—":""}</span>)}</div>}
          </div>
          {isM&&<button onClick={e=>{e.stopPropagation();delR(r.id);}} style={{...b2,padding:"3px 6px",fontSize:9,color:"#dc2626"}}>🗑️</button>}
        </div>);})}
    </div>);
  };

  // ========== TEAM ==========
  const Team=()=>{
    const handleCodeChange=(name,val)=>{setLocalCodes(prev=>({...prev,[name]:val}));};
    const handleCodeBlur=(name)=>{const code=localCodes[name]||"";updateTechCode(name,code);};
    return(<div style={{padding:16,maxWidth:520}}>
    <h2 style={{fontFamily:F,color:CL.dk,fontSize:18,fontWeight:800,marginBottom:12}}>👷 Équipe & Codes</h2>
    <div style={crd}>{techs.map((t,i)=>{const na=Object.values(assigns).filter(a=>a.tech===t.name).length;const nc=reps.filter(r=>r.tech===t.name).length;return(
      <div key={t.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<techs.length-1?`1px solid ${CL.bd}`:"none"}}>
        <div style={{flex:1}}><div style={{fontFamily:F,fontSize:13,fontWeight:700}}>{t.name}</div><div style={{fontFamily:F,fontSize:10,color:CL.sb}}>{na} PM · {nc} CR</div></div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontFamily:F,fontSize:9,color:CL.sb}}>Code:</span>
          <input value={localCodes[t.name]??t.code??""} onChange={e=>handleCodeChange(t.name,e.target.value)} onBlur={()=>handleCodeBlur(t.name)} placeholder="----" style={{...inp,width:65,fontSize:12,padding:"3px 5px",textAlign:"center",letterSpacing:2,fontFamily:"monospace"}}/>
          <button onClick={()=>removeTech(t.name)} style={{...b2,padding:"2px 5px",fontSize:9,color:"#dc2626"}}>✕</button>
        </div>
      </div>);})}</div>
    {showAddT?<div style={{display:"flex",gap:5,marginTop:8}}><input value={newT} onChange={e=>setNewT(e.target.value)} placeholder="Nom" style={{...inp,flex:1}} onKeyDown={e=>{if(e.key==="Enter"&&newT.trim()){addTech(newT.trim());setNewT("");setShowAddT(false);}}}/><button onClick={()=>{if(newT.trim()){addTech(newT.trim());setNewT("");setShowAddT(false);}}} style={b1}>✓</button><button onClick={()=>{setShowAddT(false);setNewT("");}} style={b2}>✕</button></div>
    :<button onClick={()=>setShowAddT(true)} style={{...b1,marginTop:8,width:"100%"}}>+ Ajouter</button>}
    <div style={{...crd,marginTop:14}}><h3 style={sT}>🔐 Code Manager</h3>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <input value={newMgrCode||mgrCode} onChange={e=>setNewMgrCode(e.target.value)} style={{...inp,width:90,fontSize:14,textAlign:"center",letterSpacing:3,fontFamily:"monospace",fontWeight:700}}/>
        {newMgrCode&&newMgrCode!==mgrCode&&<button onClick={()=>saveMgrCode(newMgrCode)} style={{...b1,padding:"5px 10px",fontSize:11}}>Sauver</button>}
      </div>
    </div>
  </div>);
  };

  // ========== RESOLVED PMs (Manager only) ==========
  const ResolvedPg=()=>{
    const fl=resolvedPms.filter(p=>{
      if(!resolvedSearch)return true;
      const s=resolvedSearch.toLowerCase();
      return p.code.toLowerCase().includes(s)||p.adresse.toLowerCase().includes(s)||(assigns[p.code]?.tech||"").toLowerCase().includes(s);
    });
    const resDepts=[...new Set(resolvedPms.map(p=>p.dept).filter(Boolean))].sort();

    if(viewR)return VR({r:viewR});

    return(<div style={{padding:16}}>
      <h2 style={{fontFamily:F,color:CL.dk,fontSize:18,fontWeight:800,marginBottom:4}}>✅ PM Résolus</h2>
      <p style={{fontFamily:F,fontSize:11,color:CL.sb,marginBottom:14}}>PM absents du dernier import — considérés comme traités.</p>

      {resolvedPms.length===0?
        <div style={{textAlign:"center",padding:50}}><div style={{fontSize:50}}>🎉</div><h3 style={{fontFamily:F,color:CL.dk,fontSize:16,fontWeight:800,marginTop:12}}>Aucun PM résolu</h3><p style={{fontFamily:F,color:CL.sb,marginTop:8}}>Les PM absents du prochain import apparaîtront ici.</p></div>
      :<>
        <input placeholder="🔍 Rechercher code, adresse, tech..." value={resolvedSearch} onChange={e=>setResolvedSearch(e.target.value)} style={{...inp,maxWidth:400,marginBottom:14,fontSize:13}}/>

        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
          <div style={{...crd,padding:10,display:"flex",alignItems:"center",gap:8,borderLeft:"4px solid #059669",marginBottom:0}}><span style={{fontSize:20}}>✅</span><div><div style={{fontSize:18,fontWeight:800,fontFamily:F,color:CL.dk}}>{resolvedPms.length}</div><div style={{fontSize:8,color:CL.sb,fontFamily:F,textTransform:"uppercase"}}>Résolus</div></div></div>
          <div style={{...crd,padding:10,display:"flex",alignItems:"center",gap:8,borderLeft:"4px solid #2563eb",marginBottom:0}}><span style={{fontSize:20}}>📝</span><div><div style={{fontSize:18,fontWeight:800,fontFamily:F,color:CL.dk}}>{resolvedPms.reduce((s,p)=>reps.filter(r=>(r.pmCode||r.pm_code)===p.code).length+s,0)}</div><div style={{fontSize:8,color:CL.sb,fontFamily:F,textTransform:"uppercase"}}>CR associés</div></div></div>
          <div style={{...crd,padding:10,display:"flex",alignItems:"center",gap:8,borderLeft:"4px solid #7c3aed",marginBottom:0}}><span style={{fontSize:20}}>🏢</span><div><div style={{fontSize:18,fontWeight:800,fontFamily:F,color:CL.dk}}>{resDepts.length}</div><div style={{fontSize:8,color:CL.sb,fontFamily:F,textTransform:"uppercase"}}>Depts</div></div></div>
        </div>

        <div style={{...crd,padding:0,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"2fr .5fr 2.5fr .8fr 1fr 1.2fr",background:"#059669",color:"#fff",fontFamily:F,fontSize:9,fontWeight:700,padding:"7px 10px",textTransform:"uppercase"}}>
            <div>Code</div><div>Dpt</div><div>Adresse</div><div style={{textAlign:"center"}}>CR</div><div style={{textAlign:"center"}}>Résolu le</div><div style={{textAlign:"center"}}>Actions</div>
          </div>
          <div style={{maxHeight:450,overflowY:"auto"}}>
            {fl.map((pm,i)=>{
              const pmReps=reps.filter(r=>(r.pmCode||r.pm_code)===pm.code);
              const resDate=pm.resolved_at?new Date(pm.resolved_at).toLocaleDateString("fr-FR"):"—";
              const isCrDone=pm.resolved_reason==="cr_done";
              return(<div key={pm.code} style={{display:"grid",gridTemplateColumns:"2fr .5fr 2.5fr .8fr 1fr 1.2fr",padding:"8px 10px",fontFamily:F,fontSize:11,background:i%2===0?"#fff":"#f0fdf4",borderBottom:`1px solid ${CL.bd}`,alignItems:"center"}}>
                <div><div style={{fontWeight:700,fontSize:10,fontFamily:"monospace",color:CL.dk}}>{pm.code}</div>{isCrDone&&<B color="green">CR effectué</B>}{!isCrDone&&<B color="gray">Import</B>}</div>
                <div style={{color:CL.sb,fontSize:10}}>{pm.dept}</div>
                <div style={{color:"#374151",fontSize:10}}>{pm.adresse}</div>
                <div style={{textAlign:"center"}}>
                  {pmReps.length>0?<button onClick={()=>{setPg("hist");setHistSearch(pm.code);}} style={{...b2,padding:"2px 7px",fontSize:9,color:"#059669",borderColor:"#86efac"}}>📋 {pmReps.length}</button>
                  :<span style={{fontFamily:F,fontSize:10,color:CL.sb}}>—</span>}
                </div>
                <div style={{textAlign:"center",fontFamily:F,fontSize:9,color:CL.sb}}>{resDate}</div>
                <div style={{textAlign:"center"}}>
                  <button onClick={()=>{setShowAss(pm.code);setAssTypes([]);}} style={{...b2,padding:"3px 8px",fontSize:9,color:"#2563eb",borderColor:"#93c5fd"}} title="Réaffecter ce PM">🔄 Réaffecter</button>
                </div>
              </div>);
            })}
          </div>
        </div>
        {fl.length===0&&resolvedSearch&&<div style={{textAlign:"center",padding:30,color:CL.sb,fontFamily:F}}>Aucun PM résolu correspondant.</div>}
      </>}
    </div>);
  };

  // ========== MESSAGES (Tech) ==========
  const MessagesPg=()=>{
    // Tech: sees rejection messages | Manager: sees pending CRs + resubmission notifications
    const markRead=async(id)=>{
      supabase.from("messages").update({read:true}).eq("id",id);
      setMessages(prev=>prev.map(m=>m.id===id?{...m,read:true}:m));
    };

    if(isT){
      const myMsgs=messages.filter(m=>m.tech_name===tName&&m.type==="rejection");
      const markAllRead=async()=>{
        const ids=myMsgs.filter(m=>!m.read).map(m=>m.id);
        if(ids.length===0)return;
        supabase.from("messages").update({read:true}).in("id",ids);
        setMessages(prev=>prev.map(m=>ids.includes(m.id)?{...m,read:true}:m));
      };
      return(<div style={{padding:16,maxWidth:600}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h2 style={{fontFamily:F,color:CL.dk,fontSize:18,fontWeight:800}}>💬 Messages</h2>
          {myMsgs.some(m=>!m.read)&&<button onClick={markAllRead} style={{...b2,padding:"5px 12px",fontSize:10}}>Tout marquer comme lu</button>}
        </div>
        {myMsgs.length===0?<div style={{textAlign:"center",padding:50}}><div style={{fontSize:50}}>📭</div><h3 style={{fontFamily:F,color:CL.dk,fontSize:16,fontWeight:800,marginTop:12}}>Aucun message</h3><p style={{fontFamily:F,color:CL.sb,marginTop:8}}>Les renvois du manager apparaîtront ici.</p></div>
        :myMsgs.map(m=>{
          const dateStr=m.created_at?new Date(m.created_at).toLocaleDateString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";
          const relatedCR=reps.find(r=>r.id==m.report_id);
          return(<div key={m.id} style={{...crd,borderLeft:`4px solid ${m.read?"#d1d5db":"#dc2626"}`,background:m.read?"#fff":"#fef2f2",cursor:"pointer"}} onClick={()=>{if(!m.read)markRead(m.id);if(relatedCR){setViewR(relatedCR);setPg("hist");}}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
              <div style={{display:"flex",gap:5,alignItems:"center"}}>
                {!m.read&&<span style={{width:8,height:8,borderRadius:"50%",background:"#dc2626",flexShrink:0}}/>}
                <span style={{fontFamily:"monospace",fontSize:12,fontWeight:800,color:CL.dk}}>{m.pm_code}</span>
                <B color="red">🔄 Renvoyé</B>
              </div>
              <span style={{fontFamily:F,fontSize:9,color:CL.sb}}>{dateStr}</span>
            </div>
            <div style={{fontFamily:F,fontSize:12,color:"#b91c1c",marginTop:4,whiteSpace:"pre-wrap"}}>{m.message}</div>
            <div style={{fontFamily:F,fontSize:9,color:CL.sb,marginTop:6}}>Cliquer pour voir et corriger le CR</div>
          </div>);
        })}
      </div>);
    }

    // ========== MANAGER VIEW ==========
    const pendingCRs=reps.filter(r=>r.validation==="pending");
    const resubMsgs=messages.filter(m=>m.type==="resubmission");
    const rejectionsSent=messages.filter(m=>m.type==="rejection");
    const markAllMgrRead=async()=>{
      const ids=resubMsgs.filter(m=>!m.read).map(m=>m.id);
      if(ids.length===0)return;
      supabase.from("messages").update({read:true}).in("id",ids);
      setMessages(prev=>prev.map(m=>ids.includes(m.id)?{...m,read:true}:m));
    };

    return(<div style={{padding:16,maxWidth:700}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <h2 style={{fontFamily:F,color:CL.dk,fontSize:18,fontWeight:800}}>💬 Suivi CR</h2>
        {resubMsgs.some(m=>!m.read)&&<button onClick={markAllMgrRead} style={{...b2,padding:"5px 12px",fontSize:10}}>Tout marquer comme lu</button>}
      </div>

      {pendingCRs.length>0&&<div style={{marginBottom:16}}>
        <h3 style={{fontFamily:F,fontSize:13,fontWeight:800,color:"#92400e",marginBottom:8}}>🟡 CR en attente de validation ({pendingCRs.length})</h3>
        {pendingCRs.map(r=>{
          const pmCode=r.pmCode||r.pm_code||"";const dateStr=r.date?new Date(r.date).toLocaleDateString("fr-FR"):"";
          return(<div key={r.id} style={{...crd,borderLeft:"4px solid #f59e0b",cursor:"pointer"}} onClick={()=>{setViewR(r);setPg("hist");}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",gap:5,alignItems:"center"}}><span style={{fontFamily:"monospace",fontSize:12,fontWeight:800}}>{pmCode}</span><B color="orange">🟡 En attente</B></div>
              <span style={{fontFamily:F,fontSize:9,color:CL.sb}}>{dateStr}</span>
            </div>
            <div style={{fontFamily:F,fontSize:10,color:CL.sb,marginTop:3}}>👷 {r.tech||"?"} — Cliquer pour valider ou renvoyer</div>
          </div>);
        })}
      </div>}

      {resubMsgs.length>0&&<div style={{marginBottom:16}}>
        <h3 style={{fontFamily:F,fontSize:13,fontWeight:800,color:"#1e40af",marginBottom:8}}>🔄 CR ressoumis après correction ({resubMsgs.length})</h3>
        {resubMsgs.map(m=>{
          const dateStr=m.created_at?new Date(m.created_at).toLocaleDateString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";
          const relatedCR=reps.find(r=>r.id==m.report_id);
          return(<div key={m.id} style={{...crd,borderLeft:`4px solid ${m.read?"#93c5fd":"#1e40af"}`,background:m.read?"#fff":"#eff6ff",cursor:"pointer"}} onClick={()=>{if(!m.read)markRead(m.id);if(relatedCR){setViewR(relatedCR);setPg("hist");}}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{display:"flex",gap:5,alignItems:"center"}}>
                {!m.read&&<span style={{width:8,height:8,borderRadius:"50%",background:"#1e40af",flexShrink:0}}/>}
                <span style={{fontFamily:"monospace",fontSize:12,fontWeight:800,color:CL.dk}}>{m.pm_code}</span>
                <B color="blue">✏️ Corrigé</B>
              </div>
              <span style={{fontFamily:F,fontSize:9,color:CL.sb}}>{dateStr}</span>
            </div>
            <div style={{fontFamily:F,fontSize:11,color:"#1e40af",marginTop:4}}>{m.message}</div>
            <div style={{fontFamily:F,fontSize:9,color:CL.sb,marginTop:4}}>Cliquer pour revalider le CR</div>
          </div>);
        })}
      </div>}

      {rejectionsSent.length>0&&<div>
        <h3 style={{fontFamily:F,fontSize:13,fontWeight:800,color:CL.sb,marginBottom:8}}>📤 Renvois envoyés ({rejectionsSent.length})</h3>
        {rejectionsSent.slice(0,20).map(m=>{
          const dateStr=m.created_at?new Date(m.created_at).toLocaleDateString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";
          const relatedCR=reps.find(r=>r.id==m.report_id);
          const crStatus=relatedCR?.validation||"?";
          return(<div key={m.id} style={{...crd,borderLeft:"4px solid #d1d5db",opacity:crStatus==="validated"?.6:1}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{display:"flex",gap:5,alignItems:"center"}}>
                <span style={{fontFamily:"monospace",fontSize:11,fontWeight:700,color:CL.dk}}>{m.pm_code}</span>
                <span style={{fontFamily:F,fontSize:10,color:CL.sb}}>→ {m.tech_name}</span>
                <B color={crStatus==="validated"?"green":crStatus==="pending"?"orange":"red"}>{crStatus==="validated"?"✅ Validé":crStatus==="pending"?"🟡 En attente":"🔄 Rejeté"}</B>
              </div>
              <span style={{fontFamily:F,fontSize:9,color:CL.sb}}>{dateStr}</span>
            </div>
            <div style={{fontFamily:F,fontSize:10,color:"#b91c1c",marginTop:3}}>{m.message}</div>
          </div>);
        })}
      </div>}

      {pendingCRs.length===0&&resubMsgs.length===0&&rejectionsSent.length===0&&<div style={{textAlign:"center",padding:50}}><div style={{fontSize:50}}>✅</div><h3 style={{fontFamily:F,color:CL.dk,fontSize:16,fontWeight:800,marginTop:12}}>Tout est à jour</h3><p style={{fontFamily:F,color:CL.sb,marginTop:8}}>Aucun CR en attente.</p></div>}
    </div>);
  };

  // ========== ROUTE / TOURNÉE ==========
  const RoutePg=()=>{
    const techsWithPms=isM?[...new Set(Object.values(assigns).map(a=>a.tech).filter(Boolean))]:[];
    const currentTech=isT?tName:null;
    const geoPms=myPms.filter(p=>p.lat&&p.lng);
    const nonGeoPms=myPms.filter(p=>!p.lat||!p.lng);

    return(<div style={{padding:16,maxWidth:700}}>
      <h2 style={{fontFamily:F,color:CL.dk,fontSize:18,fontWeight:800,marginBottom:12}}>🗺️ Tournée optimisée</h2>

      {isM&&<div style={{...crd}}>
        <h3 style={sT}>Calculer une tournée</h3>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {techsWithPms.map(t=>{const n=activePms.filter(p=>assigns[p.code]?.tech===t&&p.lat).length;return(
            <button key={t} onClick={()=>calcRoute(t)} style={{...b1,padding:"8px 14px",fontSize:12}}>{t} ({n} PM)</button>
          );})}
        </div>
        {techsWithPms.length===0&&<div style={{fontFamily:F,fontSize:12,color:CL.sb}}>Affectez des PM aux techniciens d'abord.</div>}
      </div>}

      {isT&&<div style={{...crd}}>
        <button onClick={()=>calcRoute(tName)} style={{...b1,width:"100%",padding:"14px",fontSize:14}}>🗺️ Calculer ma tournée ({geoPms.length} PM)</button>
        {nonGeoPms.length>0&&<div style={{fontFamily:F,fontSize:11,color:CL.sb,marginTop:6}}>⚠️ {nonGeoPms.length} PM sans coordonnées (non géocodés)</div>}
      </div>}

      {showRoute&&routeData.length>0&&(<div style={{...crd}}>
        <h3 style={sT}>📍 Parcours optimisé — {routeData.length} étapes · {routeData[routeData.length-1]?.totalDist||0} km</h3>
        
        <button onClick={()=>{
          const pts=routeData.map(p=>`${p.lat},${p.lng}`);
          const origin=pts[0];const dest=pts[pts.length-1];const waypoints=pts.slice(1,-1).join("|");
          window.open(`https://www.google.com/maps/dir/${pts.join("/")}`, "_blank");
        }} style={{...b1,width:"100%",padding:"12px",fontSize:13,marginBottom:12,background:"#1a73e8"}}>
          🗺️ Ouvrir l'itinéraire complet dans Google Maps
        </button>

        {routeData.map((p,i)=>(
          <div key={p.code} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:i<routeData.length-1?`1px solid ${CL.bd}`:"none"}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:CL.a,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F,fontSize:12,fontWeight:800,flexShrink:0}}>{p.step}</div>
            <div style={{flex:1}}>
              <div style={{fontFamily:"monospace",fontSize:11,fontWeight:700,color:CL.dk}}>{p.code}</div>
              <div style={{fontFamily:F,fontSize:10,color:CL.sb}}>{p.adresse}</div>
              {i>0&&<div style={{fontFamily:F,fontSize:10,color:"#7c3aed",fontWeight:600}}>↳ {p.stepDist} km depuis l'étape précédente</div>}
            </div>
            <div style={{display:"flex",gap:4,flexShrink:0}}>
              <button onClick={()=>openWaze(p.lat,p.lng)} style={{...b2,padding:"4px 8px",fontSize:9,color:"#33ccff",borderColor:"#33ccff"}}>Waze</button>
              <button onClick={()=>openMaps(p.lat,p.lng,p.code)} style={{...b2,padding:"4px 8px",fontSize:9,color:"#1a73e8",borderColor:"#1a73e8"}}>Maps</button>
            </div>
          </div>
        ))}
      </div>)}

      {showRoute&&routeData.length===0&&<div style={{...crd,textAlign:"center",padding:30}}><div style={{fontSize:30}}>📍</div><div style={{fontFamily:F,fontSize:13,color:CL.sb,marginTop:8}}>Aucun PM géocodé pour ce technicien. Réimportez les PM pour géocoder les adresses.</div></div>}
    </div>);
  };

  return(<div style={{fontFamily:F,background:CL.bg,minHeight:"100vh"}}>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
    {Head()}{pg==="dash"&&Dash()}{pg==="import"&&isM&&ImportPg()}{pg==="form"&&FormCR()}{pg==="ok"&&OkPg()}{pg==="hist"&&Hist()}{pg==="team"&&isM&&Team()}{pg==="resolved"&&isM&&ResolvedPg()}{pg==="messages"&&MessagesPg()}{pg==="route"&&RoutePg()}
    {showReject&&isM&&(<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}} onClick={()=>setShowReject(null)}><div style={{background:"#fff",borderRadius:12,padding:20,width:440,maxHeight:"80vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
      <h3 style={{fontFamily:F,color:"#dc2626",fontSize:14,fontWeight:800,marginBottom:12}}>🔄 Renvoyer le CR — {showReject.pmCode||showReject.pm_code}</h3>
      <div style={{...lbl,marginBottom:6}}>Motifs prédéfinis</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:12}}>{REJECT_MSGS.map(m=><button key={m} onClick={()=>setRejectPresets(p=>p.includes(m)?p.filter(x=>x!==m):[...p,m])} style={{padding:"4px 8px",borderRadius:14,border:`1.5px solid ${rejectPresets.includes(m)?"#dc2626":CL.bd}`,background:rejectPresets.includes(m)?"#fee2e2":"#fff",color:rejectPresets.includes(m)?"#dc2626":CL.sb,fontFamily:F,fontSize:10,fontWeight:600,cursor:"pointer"}}>{rejectPresets.includes(m)?"✓ ":""}{m}</button>)}</div>
      <div style={{marginBottom:12}}><label style={lbl}>Message personnalisé</label><textarea value={rejectCustom} onChange={e=>setRejectCustom(e.target.value)} rows={3} placeholder="Détails supplémentaires..." style={{...inp,resize:"vertical",fontSize:12}}/></div>
      <div style={{display:"flex",gap:8}}><button onClick={()=>rejectCR(showReject)} style={{...b1,background:"#dc2626",flex:1}}>🔄 Envoyer le renvoi</button><button onClick={()=>setShowReject(null)} style={{...b2,flex:1}}>Annuler</button></div>
    </div></div>)}
    {Lightbox()}
    {toast&&<div onClick={()=>setToast(null)} style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:"#1e40af",color:"#fff",fontFamily:F,fontSize:13,fontWeight:700,padding:"14px 24px",borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,.25)",zIndex:9998,cursor:"pointer",maxWidth:"90vw",textAlign:"center",animation:"slideDown .4s ease"}}><style>{`@keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-20px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}`}</style>🔔 {toast.message}</div>}
  </div>);
}
