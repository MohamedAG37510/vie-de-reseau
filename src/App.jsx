import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase.js";

const ETATS=["Bon état général","État moyen - maintenance préventive","Dégradé - intervention nécessaire","Critique - urgent","Vandalisé","Inaccessible"];
const TYPES=["SAV - Remise en service","SAV - Remplacement équipement","SAV - Recâblage","Maintenance préventive","Nettoyage / Réorganisation","Remplacement cassette(s)","Remplacement coupleur","Soudure(s) fibre","Rebrassage","Mesure optique","Intervention multi-SAV","Autre"];
const PROBS=["Fibres cassées","Connecteurs sales/endommagés","Cassettes mal rangées","Câbles non étiquetés","Boîtier endommagé","Infiltration d'eau","Coupleur défaillant","Soudures défectueuses","Câble sectionné","PM saturé","Vandalisme","Aucun problème"];

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
  const [user,setUser]=useState(null);
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
  const [selPM,setSelPM]=useState(null);
  const [form,setForm]=useState(null);
  const [viewR,setViewR]=useState(null);
  const [newT,setNewT]=useState("");
  const [showAddT,setShowAddT]=useState(false);
  const [impMsg,setImpMsg]=useState("");
  const [showAss,setShowAss]=useState(null);
  const [newMgrCode,setNewMgrCode]=useState("");
  const fileRef=useRef(null);
  const impRef=useRef(null);

  // ========== SUPABASE DATA LOADING ==========
  const loadAll = useCallback(async()=>{
    try{
      const [{data:pmData},{data:techData},{data:repData},{data:assData},{data:cfgData}] = await Promise.all([
        supabase.from("pms").select("*").order("nb_iw",{ascending:false}),
        supabase.from("techs").select("*").order("name"),
        supabase.from("reports").select("*").order("created_at",{ascending:false}),
        supabase.from("assignments").select("*"),
        supabase.from("config").select("*"),
      ]);
      if(pmData) setPms(pmData.map(p=>({code:p.code,dept:p.dept,adresse:p.adresse,nbIW:p.nb_iw})));
      if(techData) setTechs(techData);
      if(repData) setReps(repData.map(r=>({...r,pmCode:r.pm_code,pmAdresse:r.pm_adresse,pmDept:r.pm_dept,nbCli:r.nb_cli,suiviTxt:r.suivi_txt})));
      if(assData){const a={};assData.forEach(x=>a[x.pm_code]=x.tech_name);setAssigns(a);}
      if(cfgData){const mc=cfgData.find(c=>c.key==="mgr_code");if(mc)setMgrCode(mc.value);}
    }catch(e){console.error("Load error:",e);}
    setLoading(false);
  },[]);

  useEffect(()=>{loadAll();},[loadAll]);

  // Realtime subscriptions
  useEffect(()=>{
    const ch = supabase.channel("all-changes")
      .on("postgres_changes",{event:"*",schema:"public",table:"pms"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"techs"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"reports"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"assignments"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"config"},()=>loadAll())
      .subscribe();
    return ()=>{supabase.removeChannel(ch);};
  },[loadAll]);

  // ========== SUPABASE MUTATIONS ==========
  const savePms=async(newPms)=>{
    const rows=newPms.map(p=>({code:p.code,dept:p.dept,adresse:p.adresse,nb_iw:p.nbIW}));
    await supabase.from("pms").upsert(rows,{onConflict:"code"});
    setPms(newPms);
  };

  const saveR=async(allReps)=>{setReps(allReps);};

  const insertReport=async(r)=>{
    const row={id:r.id,pm_code:r.pmCode,pm_adresse:r.pmAdresse,pm_dept:r.pmDept,date:r.date,h1:r.h1,h2:r.h2,tech:r.tech,types:r.types,probs:r.probs,etat:r.etat,nb_cli:r.nbCli,mesures:r.mesures,actions:r.actions,materiel:r.materiel,obs:r.obs,suivi:r.suivi,suivi_txt:r.suiviTxt,photos:r.photos};
    await supabase.from("reports").insert(row);
    await loadAll();
  };

  const delR=async(id)=>{
    await supabase.from("reports").delete().eq("id",id);
    setReps(reps.filter(r=>r.id!==id));
    if(viewR?.id===id)setViewR(null);
  };

  const addTech=async(name)=>{
    await supabase.from("techs").insert({name,code:""});
    await loadAll();
  };

  const removeTech=async(name)=>{
    await supabase.from("techs").delete().eq("name",name);
    await supabase.from("assignments").delete().eq("tech_name",name);
    await loadAll();
  };

  const updateTechCode=async(name,code)=>{
    await supabase.from("techs").update({code}).eq("name",name);
    setTechs(techs.map(t=>t.name===name?{...t,code}:t));
  };

  const assignTech=async(pmCode,techName)=>{
    if(!techName){await supabase.from("assignments").delete().eq("pm_code",pmCode);}
    else{await supabase.from("assignments").upsert({pm_code:pmCode,tech_name:techName},{onConflict:"pm_code"});}
    const na={...assigns};if(!techName)delete na[pmCode];else na[pmCode]=techName;
    setAssigns(na);setShowAss(null);
  };

  const saveMgrCode=async(code)=>{
    await supabase.from("config").upsert({key:"mgr_code",value:code},{onConflict:"key"});
    setMgrCode(code);setNewMgrCode("");
  };

  // ========== DELETE PMS ==========
  const resetPms=async()=>{
    await supabase.from("assignments").delete().neq("pm_code","");
    await supabase.from("pms").delete().neq("code","");
    setPms([]);setAssigns({});
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

  // ========== IMPORT ==========
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
      const rows=np.map(p=>({code:p.code,dept:p.dept,adresse:p.adresse,nb_iw:p.nbIW}));
      const{error}=await supabase.from("pms").upsert(rows,{onConflict:"code"});
      if(error){setImpMsg("Erreur: "+error.message);return;}
      setImpMsg(`${np.length} PM importés/mis à jour`);
      await loadAll();
    };
    reader.readAsText(file);e.target.value="";
  };

  const handlePhotos=e=>{Array.from(e.target.files).forEach(f=>{const rd=new FileReader();rd.onload=ev=>setForm(fm=>({...fm,photos:[...(fm.photos||[]),{name:f.name,data:ev.target.result,label:""}]}));rd.readAsDataURL(f);});e.target.value="";};
  const toggleArr=(field,val)=>setForm(f=>({...f,[field]:f[field].includes(val)?f[field].filter(v=>v!==val):[...f[field],val]}));

  const depts=[...new Set(pms.map(p=>p.dept).filter(Boolean))].sort();
  const myPms=isT?pms.filter(pm=>assigns[pm.code]===tName):pms;
  const filtered=myPms.filter(pm=>(pm.code.toLowerCase().includes(search.toLowerCase())||pm.adresse.toLowerCase().includes(search.toLowerCase()))&&(fDept==="all"||pm.dept===fDept));
  const myReps=isT?reps.filter(r=>r.tech===tName):reps;
  const repsFor=code=>myReps.filter(r=>r.pmCode===code);

  const startCR=pm=>{setSelPM(pm);setForm({pmCode:pm.code,pmAdresse:pm.adresse,pmDept:pm.dept,date:new Date().toISOString().slice(0,10),h1:"",h2:"",tech:isT?tName:(assigns[pm.code]||""),types:[],probs:[],etat:"",nbCli:0,mesures:"",actions:"",materiel:"",obs:"",photos:[],suivi:false,suiviTxt:""});setPg("form");};
  const submitCR=async()=>{const r={...form,id:Date.now(),created:new Date().toISOString()};await insertReport(r);setPg("ok");};

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
      <div style={{textAlign:"center"}}><div style={{fontSize:40,marginBottom:12}}>⚡</div><div style={{fontFamily:F,fontSize:14,color:CL.sb}}>Chargement...</div></div>
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
        {isM&&<button onClick={()=>{setPg("team");}} style={{padding:"5px 10px",borderRadius:4,border:"none",background:pg==="team"?CL.a:"rgba(255,255,255,.06)",color:pg==="team"?"#fff":CL.wm,fontFamily:F,fontSize:10,fontWeight:700,cursor:"pointer"}}>👷 Équipe</button>}
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
    </div>
    <div style={crd}>
      <div style={{fontFamily:F,fontSize:13,color:CL.dk}}><strong>{pms.length}</strong> PM · <strong>{depts.length}</strong> depts</div>
      {pms.length>0&&<button onClick={resetPms} style={{...b2,marginTop:10,fontSize:11,color:"#dc2626",borderColor:"#fca5a5"}}>🗑️ Réinitialiser</button>}
    </div>
  </div>);

  // ========== DASHBOARD ==========
  const Dash=()=>{
    const aff=Object.keys(assigns).length;
    const stats=isM?[{l:"PM",v:pms.length,i:"🏗️",c:"#2563eb"},{l:"IW",v:pms.reduce((s,p)=>s+p.nbIW,0),i:"🔧",c:CL.a},{l:"CR",v:reps.length,i:"📝",c:"#059669"},{l:"Affectés",v:aff,i:"✅",c:"#7c3aed"},{l:"Non aff.",v:pms.length-aff,i:"⚠️",c:pms.length-aff>0?"#dc2626":"#059669"}]
    :[{l:"Mes PM",v:myPms.length,i:"🏗️",c:"#2563eb"},{l:"IW",v:myPms.reduce((s,p)=>s+p.nbIW,0),i:"🔧",c:CL.a},{l:"Mes CR",v:myReps.length,i:"📝",c:"#059669"}];
    return(<div style={{padding:16}}>
      {myPms.length===0?(
        <div style={{textAlign:"center",padding:50}}><div style={{fontSize:50}}>{isM?"📥":"📭"}</div><h2 style={{fontFamily:F,color:CL.dk,fontSize:18,fontWeight:800,marginTop:12}}>{isM?"Aucun PM":"Aucun PM affecté"}</h2><p style={{fontFamily:F,color:CL.sb,marginTop:8}}>{isM?"Importez votre fichier.":"Contactez votre manager."}</p>{isM&&<button onClick={()=>setPg("import")} style={{...b1,marginTop:16}}>📥 Importer</button>}</div>
      ):(<>
      <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(stats.length,5)},1fr)`,gap:8,marginBottom:16}}>
        {stats.map((s,i)=>(<div key={i} style={{...crd,padding:10,display:"flex",alignItems:"center",gap:8,borderLeft:`4px solid ${s.c}`,marginBottom:0}}><span style={{fontSize:20}}>{s.i}</span><div><div style={{fontSize:18,fontWeight:800,fontFamily:F,color:CL.dk}}>{s.v}</div><div style={{fontSize:8,color:CL.sb,fontFamily:F,textTransform:"uppercase"}}>{s.l}</div></div></div>))}
      </div>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <input placeholder="🔍 Rechercher..." value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,maxWidth:260,fontSize:13}}/>
        <select value={fDept} onChange={e=>setFDept(e.target.value)} style={{...inp,maxWidth:120,fontSize:13}}><option value="all">Tous</option>{depts.map(d=><option key={d} value={d}>{d}</option>)}</select>
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
            {isM&&<div style={{textAlign:"center"}}>{assigns[pm.code]?<><B color="purple">{assigns[pm.code]}</B><button onClick={()=>setShowAss(pm.code)} style={{border:"none",background:"transparent",cursor:"pointer",fontSize:8,marginLeft:2}}>✏️</button></>:<button onClick={()=>setShowAss(pm.code)} style={{...b2,padding:"2px 6px",fontSize:8,color:"#7c3aed",borderColor:"#c4b5fd"}}>Affecter</button>}</div>}
            <div style={{textAlign:"center",display:"flex",gap:3,justifyContent:"center"}}>
              <button onClick={()=>startCR(pm)} style={{...b1,padding:"3px 7px",fontSize:9}}>+CR</button>
              {repsFor(pm.code).length>0&&<button onClick={()=>{setPg("hist");setSearch(pm.code);}} style={{...b2,padding:"2px 5px",fontSize:8}}>📋{repsFor(pm.code).length}</button>}
            </div>
          </div>))}
        </div>
      </div></>)}
      {showAss&&isM&&(<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}} onClick={()=>setShowAss(null)}><div style={{background:"#fff",borderRadius:12,padding:20,width:320}} onClick={e=>e.stopPropagation()}>
        <h3 style={{fontFamily:F,color:CL.dk,fontSize:14,fontWeight:800,marginBottom:12}}>Affecter — {showAss}</h3>
        <div style={{display:"flex",flexDirection:"column",gap:5}}>
          {techs.map(t=><button key={t.name} onClick={()=>assignTech(showAss,t.name)} style={{...b2,width:"100%",textAlign:"left",padding:"8px 12px",fontSize:13,fontWeight:assigns[showAss]===t.name?800:500,background:assigns[showAss]===t.name?"#f3e8ff":"#fff"}}>👷 {t.name}{assigns[showAss]===t.name?" ✓":""}</button>)}
        </div>
        {assigns[showAss]&&<button onClick={()=>assignTech(showAss,null)} style={{...b2,width:"100%",marginTop:8,fontSize:11,color:"#dc2626"}}>Retirer</button>}
        <button onClick={()=>setShowAss(null)} style={{...b2,width:"100%",marginTop:6}}>Fermer</button>
      </div></div>)}
    </div>);
  };

  // ========== FORM ==========
  const FormCR=()=>{
    if(!form)return null;
    const ok=form.tech&&form.types.length>0&&form.etat&&form.actions;
    return(<div style={{padding:16,maxWidth:800,margin:"0 auto"}}>
      <button onClick={()=>setPg("dash")} style={{...b2,marginBottom:12,fontSize:11}}>← Retour</button>
      <div style={{...crd,borderLeft:`4px solid ${CL.a}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{fontFamily:F,fontWeight:800,fontSize:16,color:CL.dk}}>{form.pmCode}</div><div style={{fontFamily:F,fontSize:11,color:CL.sb,marginTop:2}}>{form.pmAdresse}</div></div>
        <div style={{textAlign:"right"}}><B color={pC(selPM.nbIW)}>{pL(selPM.nbIW)}</B><div style={{fontFamily:F,fontSize:10,color:CL.sb,marginTop:2}}>{selPM.nbIW} IW</div></div>
      </div>
      <div style={crd}><h3 style={sT}>📋 Infos</h3>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
          <div><label style={lbl}>Date *</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inp}/></div>
          <div><label style={lbl}>Arrivée</label><input type="time" value={form.h1} onChange={e=>setForm(f=>({...f,h1:e.target.value}))} style={inp}/></div>
          <div><label style={lbl}>Départ</label><input type="time" value={form.h2} onChange={e=>setForm(f=>({...f,h2:e.target.value}))} style={inp}/></div>
        </div>
        {isM?<div style={{marginBottom:12}}><label style={lbl}>Technicien *</label><select value={form.tech} onChange={e=>setForm(f=>({...f,tech:e.target.value}))} style={inp}><option value="">--</option>{techs.map(t=><option key={t.name} value={t.name}>{t.name}</option>)}</select></div>
        :<div style={{marginBottom:12}}><label style={lbl}>Technicien</label><div style={{...inp,background:"#f4f3ef",fontWeight:700}}>{tName}</div></div>}
        <div style={{marginBottom:12}}><label style={lbl}>Type *</label><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{TYPES.map(t=><button key={t} onClick={()=>toggleArr("types",t)} style={{padding:"4px 8px",borderRadius:14,border:`1.5px solid ${form.types.includes(t)?CL.a:CL.bd}`,background:form.types.includes(t)?"#fef2f2":"#fff",color:form.types.includes(t)?CL.a:CL.sb,fontFamily:F,fontSize:10,fontWeight:600,cursor:"pointer"}}>{form.types.includes(t)?"✓ ":""}{t}</button>)}</div></div>
        <div style={{marginBottom:12}}><label style={lbl}>Problèmes</label><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{PROBS.map(p=><button key={p} onClick={()=>toggleArr("probs",p)} style={{padding:"4px 8px",borderRadius:14,border:`1.5px solid ${form.probs.includes(p)?"#dc2626":CL.bd}`,background:form.probs.includes(p)?"#fef2f2":"#fff",color:form.probs.includes(p)?"#dc2626":CL.sb,fontFamily:F,fontSize:10,fontWeight:600,cursor:"pointer"}}>{form.probs.includes(p)?"✓ ":""}{p}</button>)}</div></div>
        <div style={{marginBottom:12}}><label style={lbl}>État *</label><select value={form.etat} onChange={e=>setForm(f=>({...f,etat:e.target.value}))} style={inp}><option value="">--</option>{ETATS.map(e=><option key={e} value={e}>{e}</option>)}</select></div>
        <div><label style={lbl}>Clients rétablis</label><input type="number" min="0" value={form.nbCli} onChange={e=>setForm(f=>({...f,nbCli:parseInt(e.target.value)||0}))} style={{...inp,maxWidth:90}}/></div>
      </div>
      <div style={crd}><h3 style={sT}>🔧 Technique</h3>
        <div style={{marginBottom:12}}><label style={lbl}>Actions *</label><textarea value={form.actions} onChange={e=>setForm(f=>({...f,actions:e.target.value}))} rows={3} style={{...inp,resize:"vertical"}}/></div>
        <div style={{marginBottom:12}}><label style={lbl}>Mesures</label><textarea value={form.mesures} onChange={e=>setForm(f=>({...f,mesures:e.target.value}))} rows={2} style={{...inp,resize:"vertical"}}/></div>
        <div style={{marginBottom:12}}><label style={lbl}>Matériel</label><textarea value={form.materiel} onChange={e=>setForm(f=>({...f,materiel:e.target.value}))} rows={2} style={{...inp,resize:"vertical"}}/></div>
        <div style={{marginBottom:12}}><label style={lbl}>Observations</label><textarea value={form.obs} onChange={e=>setForm(f=>({...f,obs:e.target.value}))} rows={2} style={{...inp,resize:"vertical"}}/></div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><input type="checkbox" checked={form.suivi} onChange={e=>setForm(f=>({...f,suivi:e.target.checked}))} style={{width:16,height:16,accentColor:CL.a}}/><label style={{fontFamily:F,fontSize:12,fontWeight:700}}>Suivi nécessaire</label></div>
        {form.suivi&&<textarea value={form.suiviTxt} onChange={e=>setForm(f=>({...f,suiviTxt:e.target.value}))} rows={2} style={{...inp,resize:"vertical"}}/>}
      </div>
      <div style={crd}><h3 style={sT}>📸 Photos</h3>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple onChange={handlePhotos} style={{display:"none"}}/>
        <button onClick={()=>fileRef.current?.click()} style={{...b1,background:"#fff",color:CL.a,border:`2px dashed ${CL.a}`,width:"100%",padding:14,marginBottom:10,fontSize:12}}>📷 Prendre / ajouter photos</button>
        {form.photos?.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>{form.photos.map((p,i)=><div key={i} style={{borderRadius:6,border:`1px solid ${CL.bd}`,overflow:"hidden"}}><div style={{position:"relative"}}><img src={p.data} style={{width:"100%",height:90,objectFit:"cover",display:"block"}}/><button onClick={()=>setForm(f=>({...f,photos:f.photos.filter((_,j)=>j!==i)}))} style={{position:"absolute",top:2,right:2,width:18,height:18,borderRadius:"50%",border:"none",background:"rgba(0,0,0,.6)",color:"#fff",fontSize:10,cursor:"pointer"}}>✕</button></div><div style={{padding:3}}><input value={p.label} onChange={e=>{const ph=[...form.photos];ph[i]={...ph[i],label:e.target.value};setForm(f=>({...f,photos:ph}));}} placeholder="Légende" style={{...inp,fontSize:9,padding:"2px 4px"}}/></div></div>)}</div>}
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginBottom:30}}>
        <button onClick={()=>setPg("dash")} style={b2}>Annuler</button>
        <button onClick={submitCR} disabled={!ok} style={{...b1,opacity:ok?1:.4,cursor:ok?"pointer":"not-allowed",padding:"10px 24px",fontSize:14}}>✅ Valider</button>
      </div>
    </div>);
  };

  const OkPg=()=>(<div style={{padding:20,maxWidth:400,margin:"50px auto",textAlign:"center"}}><div style={{fontSize:56}}>✅</div><h2 style={{fontFamily:F,color:CL.dk,fontSize:20,fontWeight:800,marginTop:12}}>CR enregistré !</h2><p style={{fontFamily:F,color:CL.sb,margin:"12px 0 20px"}}>PM: <strong>{form?.pmCode}</strong></p><div style={{display:"flex",gap:8,justifyContent:"center"}}><button onClick={()=>setPg("dash")} style={b2}>Dashboard</button><button onClick={()=>setPg("hist")} style={b1}>Voir CR</button></div></div>);

  // ========== VIEW REPORT ==========
  const VR=({r})=>(<div style={{padding:16,maxWidth:800,margin:"0 auto"}}><button onClick={()=>setViewR(null)} style={{...b2,marginBottom:12,fontSize:11}}>← Retour</button>
    <div style={{...crd,border:`2px solid ${CL.a}`}}>
      <div style={{display:"flex",justifyContent:"space-between",borderBottom:`2px solid ${CL.a}`,paddingBottom:10,marginBottom:14}}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}><Logo/><div><div style={{fontFamily:F,fontWeight:800,fontSize:15}}>Compte Rendu</div><div style={{fontFamily:F,fontSize:9,color:CL.sb}}>CR-{r.id}</div></div></div>
        <div style={{textAlign:"right"}}><div style={{fontFamily:F,fontSize:12,fontWeight:700}}>{new Date(r.date).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"})}</div>{r.h1&&<div style={{fontFamily:F,fontSize:10,color:CL.sb}}>{r.h1}→{r.h2||"?"}</div>}</div>
      </div>
      <div style={{background:"#fafaf6",borderRadius:8,padding:10,marginBottom:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
        <div><span style={lbl}>PM</span><div style={{fontFamily:"monospace",fontSize:12,fontWeight:800}}>{r.pmCode}</div></div>
        <div><span style={lbl}>Tech</span><div style={{fontFamily:F,fontSize:12,fontWeight:700}}>{r.tech}</div></div>
        <div style={{gridColumn:"1/-1"}}><span style={lbl}>Adresse</span><div style={{fontFamily:F,fontSize:11}}>{r.pmAdresse}</div></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <div><div style={{...lbl,marginBottom:3}}>Type</div><div style={{display:"flex",flexWrap:"wrap",gap:2}}>{r.types?.map(t=><B key={t} color="blue">{t}</B>)}</div></div>
        <div><div style={{...lbl,marginBottom:3}}>État</div><B color={r.etat?.includes("Bon")?"green":r.etat?.includes("Critique")?"red":"orange"}>{r.etat}</B></div>
      </div>
      {r.probs?.length>0&&<div style={{marginBottom:12}}><div style={{...lbl,marginBottom:3}}>Problèmes</div><div style={{display:"flex",flexWrap:"wrap",gap:2}}>{r.probs.map(p=><B key={p} color="red">{p}</B>)}</div></div>}
      <div style={{marginBottom:12}}><div style={{...lbl,marginBottom:3}}>Actions</div><div style={{fontFamily:F,fontSize:12,background:"#fafaf6",padding:8,borderRadius:6,whiteSpace:"pre-wrap",borderLeft:`3px solid ${CL.a}`}}>{r.actions}</div></div>
      {r.nbCli>0&&<div style={{marginBottom:10}}><span style={lbl}>Clients: </span><B color="green">{r.nbCli}</B></div>}
      {r.mesures&&<div style={{marginBottom:10}}><div style={lbl}>Mesures</div><div style={{fontFamily:"monospace",fontSize:10,background:"#f1f5f9",padding:6,borderRadius:4,whiteSpace:"pre-wrap"}}>{r.mesures}</div></div>}
      {r.materiel&&<div style={{marginBottom:10}}><div style={lbl}>Matériel</div><div style={{fontFamily:F,fontSize:11,whiteSpace:"pre-wrap"}}>{r.materiel}</div></div>}
      {r.obs&&<div style={{marginBottom:10}}><div style={lbl}>Observations</div><div style={{fontFamily:F,fontSize:11,fontStyle:"italic",whiteSpace:"pre-wrap"}}>{r.obs}</div></div>}
      {r.suivi&&<div style={{background:"#fef3c7",border:"1.5px solid #f59e0b",borderRadius:6,padding:8,marginBottom:10}}><div style={{fontFamily:F,fontSize:10,fontWeight:800,color:"#92400e"}}>⚠️ SUIVI</div><div style={{fontFamily:F,fontSize:11,color:"#78350f"}}>{r.suiviTxt}</div></div>}
      {r.photos?.length>0&&<div><div style={{...lbl,marginBottom:6}}>📸 Photos ({r.photos.length})</div><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>{r.photos.map((p,i)=><div key={i} style={{borderRadius:4,overflow:"hidden",border:`1px solid ${CL.bd}`}}><img src={p.data} style={{width:"100%",height:90,objectFit:"cover",display:"block"}}/>{p.label&&<div style={{padding:2,fontFamily:F,fontSize:9,color:CL.sb,textAlign:"center"}}>{p.label}</div>}</div>)}</div></div>}
    </div></div>);

  // ========== HISTORIQUE ==========
  const Hist=()=>{
    const [hs,setHs]=useState(search||"");
    const fl=myReps.filter(r=>r.pmCode?.toLowerCase().includes(hs.toLowerCase())||r.tech?.toLowerCase().includes(hs.toLowerCase()));
    if(viewR)return <VR r={viewR}/>;
    return(<div style={{padding:16}}>
      <h2 style={{fontFamily:F,color:CL.dk,fontSize:18,fontWeight:800,marginBottom:12}}>{isT?"Mes CR":"Tous les CR"}</h2>
      <input placeholder="🔍 Rechercher..." value={hs} onChange={e=>setHs(e.target.value)} style={{...inp,maxWidth:340,marginBottom:12,fontSize:13}}/>
      {fl.length===0?<div style={{textAlign:"center",padding:40,color:CL.sb,fontFamily:F}}>📭 Aucun CR.</div>:
        fl.map(r=><div key={r.id} style={{...crd,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={()=>setViewR(r)}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2,flexWrap:"wrap"}}>
              <span style={{fontFamily:F,fontWeight:800,fontSize:12}}>{r.pmCode}</span>
              <B color={r.etat?.includes("Bon")?"green":r.etat?.includes("Critique")?"red":"orange"}>{r.etat}</B>
              {r.suivi&&<B color="orange">⚠️</B>}
              {r.photos?.length>0&&<B color="gray">📸{r.photos.length}</B>}
            </div>
            <div style={{fontFamily:F,fontSize:10,color:CL.sb}}>👷 {r.tech} · {new Date(r.date).toLocaleDateString("fr-FR")}</div>
          </div>
          {isM&&<button onClick={e=>{e.stopPropagation();delR(r.id);}} style={{...b2,padding:"3px 6px",fontSize:9,color:"#dc2626"}}>🗑️</button>}
        </div>)}
    </div>);
  };

  // ========== TEAM ==========
  const Team=()=>(<div style={{padding:16,maxWidth:520}}>
    <h2 style={{fontFamily:F,color:CL.dk,fontSize:18,fontWeight:800,marginBottom:12}}>👷 Équipe & Codes</h2>
    <div style={crd}>{techs.map((t,i)=>{const na=Object.values(assigns).filter(a=>a===t.name).length;const nc=reps.filter(r=>r.tech===t.name).length;return(
      <div key={t.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<techs.length-1?`1px solid ${CL.bd}`:"none"}}>
        <div style={{flex:1}}><div style={{fontFamily:F,fontSize:13,fontWeight:700}}>{t.name}</div><div style={{fontFamily:F,fontSize:10,color:CL.sb}}>{na} PM · {nc} CR</div></div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontFamily:F,fontSize:9,color:CL.sb}}>Code:</span>
          <input value={t.code||""} onChange={e=>updateTechCode(t.name,e.target.value)} placeholder="----" style={{...inp,width:65,fontSize:12,padding:"3px 5px",textAlign:"center",letterSpacing:2,fontFamily:"monospace"}}/>
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

  return(<div style={{fontFamily:F,background:CL.bg,minHeight:"100vh"}}>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
    <Head/>{pg==="dash"&&<Dash/>}{pg==="import"&&isM&&<ImportPg/>}{pg==="form"&&<FormCR/>}{pg==="ok"&&<OkPg/>}{pg==="hist"&&<Hist/>}{pg==="team"&&isM&&<Team/>}
  </div>);
}
