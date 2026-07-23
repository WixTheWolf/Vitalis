"use client";
import {useEffect,useRef,useState} from "react";
import styles from "./Transform.module.css";
import {BASELINE,CHEST_A,CHEST_B,DAYS,START} from "./plan";

type Tab="today"|"plan"|"progress"|"chest";
type Check={weight:string;waist:string;bodyFat:string;sleep:string;readiness:string;energy:string;soreness:string;notes:string};

const EMPTY:Check={weight:"",waist:"",bodyFat:"",sleep:"",readiness:"",energy:"",soreness:"",notes:""};
const DAY6_SCALE={
  weight:"175.0",bmi:"25.9",bodyFat:"20.3%",subcutaneous:"17.8%",metabolicAge:"40",
  lean:"139.4 lb",visceral:"8",water:"57.4%",skeletal:"51.4%",bone:"7.0 lb",
  bmr:"1766",muscle:"132.2 lb",protein:"18.1%"
};
const SEEDED_CHECKS:Record<string,Check>={
  "5":{weight:"175.0",waist:"",bodyFat:"20.3",sleep:"",readiness:"",energy:"",soreness:"",notes:"Day 6 scale: BMI 25.9; subcutaneous fat 17.8%; metabolic age 40; fat-free mass 139.4 lb; visceral fat 8; body water 57.4%; skeletal muscle 51.4%; bone mass 7.0 lb; BMR 1766 kcal; muscle mass 132.2 lb; protein 18.1%."}
};
const STORE="vitalis-transform-v3";
const PHOTOS=["front","side","back"] as const;
const PHOTOSETS=[
  {label:"Day 1",src:["/transform-photos/day1-front.svg","/transform-photos/day1-side.svg","/transform-photos/day1-back.svg"]},
  {label:"Day 3",src:["/transform-photos/day3-front.svg","/transform-photos/day3-side.svg","/transform-photos/day3-back.svg"]},
];

function idxToday(){
  const now=new Date();
  const current=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
  const start=new Date(START.getFullYear(),START.getMonth(),START.getDate()).getTime();
  return Math.max(0,Math.min(29,Math.floor((current-start)/86400000)));
}

function status(c:Check){
  const sleep=+c.sleep||84;
  const readiness=+c.readiness||85;
  const energy=+c.energy||7;
  const soreness=+c.soreness||2;
  if(readiness<68||sleep<65||energy<4||soreness>7)return "Red";
  if(readiness<75||sleep<75||energy<6||soreness>5)return "Yellow";
  return "Green";
}

function resize(file:File):Promise<string>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const image=new Image();
      image.onload=()=>{
        const scale=Math.min(1,900/Math.max(image.width,image.height));
        const canvas=document.createElement("canvas");
        canvas.width=Math.round(image.width*scale);
        canvas.height=Math.round(image.height*scale);
        canvas.getContext("2d")!.drawImage(image,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL("image/jpeg",.72));
      };
      image.onerror=reject;
      image.src=reader.result as string;
    };
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}

export default function TransformApp(){
  const[tab,setTab]=useState<Tab>("today");
  const[day,setDay]=useState(0);
  const[done,setDone]=useState<Record<string,boolean>>({});
  const[checks,setChecks]=useState<Record<string,Check>>({});
  const[photos,setPhotos]=useState<Record<string,string>>({});
  const[ready,setReady]=useState(false);
  const touch=useRef(0);
  const plan=DAYS[day];
  const check=checks[day]||EMPTY;
  const mode=status(check);

  useEffect(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem(STORE)||"{}");
      setDay(saved.day??idxToday());
      setDone(saved.done||{});
      setChecks({...SEEDED_CHECKS,...(saved.checks||{})});
      setPhotos(saved.photos||{});
    }catch{
      setDay(idxToday());
      setChecks(SEEDED_CHECKS);
    }
    setReady(true);
  },[]);

  useEffect(()=>{
    if(ready)localStorage.setItem(STORE,JSON.stringify({day,done,checks,photos}));
  },[ready,day,done,checks,photos]);

  const total=DAYS.reduce((count,item)=>count+item.workout.length+4,0);
  const completed=Object.values(done).filter(Boolean).length;
  const pct=Math.round(completed/total*100);
  const toggle=(key:string)=>setDone(value=>({...value,[key]:!value[key]}));
  const setCheck=(key:keyof Check,value:string)=>setChecks(all=>({...all,[day]:{...(all[day]||EMPTY),[key]:value}}));
  const nav=(next:number)=>setDay(Math.max(0,Math.min(29,next)));
  const coach=mode==="Green"?"Full plan. Train with intent.":mode==="Yellow"?"Remove one set from each lift and skip finishers.":"Walk, mobility and McGill Big 3 only.";

  async function addPhoto(key:string,file?:File){
    if(!file)return;
    const value=await resize(file);
    setPhotos(current=>({...current,[key]:value}));
  }

  return <main className={styles.root}>
    <header className={styles.header}>
      <div><div className={styles.eyebrow}>Matthew · 30 days</div><h1 className={styles.title}>Transformation</h1></div>
      <div className={styles.phase}>{mode}</div>
    </header>

    <section className={styles.progressArea}>
      <div className={styles.progressMeta}><span>{completed} of {total} complete</span><span>{pct}%</span></div>
      <div className={styles.progressTrack}><div className={styles.progressFill} style={{width:`${pct}%`}}/></div>
    </section>

    <nav className={styles.tabs}>
      {(["today","plan","progress","chest"] as Tab[]).map(item=><button key={item} type="button" onClick={()=>setTab(item)} className={`${styles.readinessButton} ${tab===item?styles.readinessActive:""}`}>{item[0].toUpperCase()+item.slice(1)}</button>)}
    </nav>

    <section className={styles.viewport}>
      <div className={styles.slide} onTouchStart={event=>touch.current=event.changedTouches[0].clientX} onTouchEnd={event=>{const distance=event.changedTouches[0].clientX-touch.current;if(tab==="plan"&&Math.abs(distance)>55)nav(day+(distance<0?1:-1));}}>
        {tab==="today"&&<>
          <div className={styles.dayTop}>
            <div><div className={styles.date}>Day {plan.day} · {plan.date.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</div><h2 className={styles.focus}>{plan.focus}</h2></div>
            <div className={styles.phase}>{plan.phase}</div>
          </div>
          <div className={styles.metrics}><Metric a="Calories" b={`${plan.calories}`}/><Metric a="Protein" b="170 g"/><Metric a="Water" b="100 oz"/></div>
          <Panel title="Coach"><p className={styles.smallText}>{coach} {plan.coach}</p></Panel>
          <Panel title="Morning check-in">
            <div className={styles.macroGrid}>{(["weight","waist","bodyFat","sleep","readiness","energy","soreness"] as (keyof Check)[]).map(key=><label className={styles.macro} key={key}><span>{key.replace(/([A-Z])/g," $1")}</span><input value={check[key]} onChange={event=>setCheck(key,event.target.value)} inputMode="decimal"/></label>)}</div>
            <textarea value={check.notes} onChange={event=>setCheck("notes",event.target.value)} placeholder="Energy, mood, pain, notes…"/>
          </Panel>
          <Checklist title="Today's mission" items={plan.workout} prefix={`${day}:w`} done={done} toggle={toggle}/>
          <Meals day={day} done={done} toggle={toggle}/>
        </>}

        {tab==="plan"&&<>
          <Heading plan={plan}/>
          <Panel title="Training">{plan.workout.map((item,index)=><Row key={item} n={`${index+1}`} text={item}/>)}</Panel>
          <Panel title="High-protein meals">{plan.meals.map(meal=><Row key={meal.name} n={`${meal.protein}`} text={`${meal.name} — ${meal.food}`}/>)}</Panel>
        </>}

        {tab==="progress"&&<>
          <div className={styles.dayTop}>
            <div><div className={styles.date}>Visual + biometric timeline</div><h2 className={styles.focus}>Progress</h2></div>
            <div className={styles.phase}>{((+check.weight||BASELINE.weight)-BASELINE.weight).toFixed(1)} lb</div>
          </div>
          <div className={styles.metrics}><Metric a="Baseline" b={`${BASELINE.weight}`}/><Metric a="Day 6" b={DAY6_SCALE.weight}/><Metric a="Body fat" b={DAY6_SCALE.bodyFat}/></div>
          <Panel title="Day 6 · July 23 scale check">
            <div className={styles.macroGrid}>
              <Metric a="Weight" b={`${DAY6_SCALE.weight} lb`}/><Metric a="BMI" b={DAY6_SCALE.bmi}/>
              <Metric a="Body fat" b={DAY6_SCALE.bodyFat}/><Metric a="Subcutaneous" b={DAY6_SCALE.subcutaneous}/>
              <Metric a="Lean mass" b={DAY6_SCALE.lean}/><Metric a="Muscle mass" b={DAY6_SCALE.muscle}/>
              <Metric a="Skeletal" b={DAY6_SCALE.skeletal}/><Metric a="Visceral" b={DAY6_SCALE.visceral}/>
              <Metric a="Water" b={DAY6_SCALE.water}/><Metric a="Protein" b={DAY6_SCALE.protein}/>
              <Metric a="BMR" b={`${DAY6_SCALE.bmr} kcal`}/><Metric a="Metabolic age" b={DAY6_SCALE.metabolicAge}/>
            </div>
            <p className={styles.smallText}>Since baseline: weight −1.2 lb, body fat −0.3 points, subcutaneous fat −0.2 points and visceral fat 9 → 8. Muscle mass reads −0.6 lb, which is small enough to be normal smart-scale hydration noise—not a reason to change the plan.</p>
          </Panel>
          {PHOTOSETS.map(set=><Panel title={`${set.label} photos`} key={set.label}><div className="photoGrid">{set.src.map((src,index)=><figure key={src}><img src={src} alt={`${set.label} ${PHOTOS[index]}`}/><figcaption>{PHOTOS[index]}</figcaption></figure>)}</div></Panel>)}
          <Panel title="Current photos"><div className="photoGrid">{PHOTOS.map(item=><label key={item} className="photoUpload">{photos[item]?<img src={photos[item]} alt={item}/>:<span>Add {item}</span>}<input type="file" accept="image/*" hidden onChange={event=>addPhoto(item,event.target.files?.[0])}/></label>)}</div></Panel>
          <Panel title="Baseline"><div className={styles.macroGrid}><Metric a="Muscle" b={`${BASELINE.muscle} lb`}/><Metric a="Lean mass" b={`${BASELINE.lean} lb`}/><Metric a="Readiness" b={`${BASELINE.readiness}`}/><Metric a="Sleep" b={`${BASELINE.sleep}`}/></div></Panel>
        </>}

        {tab==="chest"&&<>
          <div className={styles.dayTop}><div><div className={styles.date}>Twice-weekly priority</div><h2 className={styles.focus}>Fuller Chest</h2></div><div className={styles.phase}>12–16 sets</div></div>
          <Panel title="Session A · Upper fullness">{CHEST_A.map((item,index)=><Row key={item} n={`${index+1}`} text={item}/>)}</Panel>
          <Panel title="Session B · Total thickness">{CHEST_B.map((item,index)=><Row key={item} n={`${index+1}`} text={item}/>)}</Panel>
          <Panel title="Daily posture"><p className={styles.smallText}>Wall slides 2 × 10 · face pulls 2 × 15 · doorway stretch 30 sec/side · 90/90 breathing 5 breaths. Build thickness around the sternum and improve how the rib cage displays the pecs.</p></Panel>
        </>}
      </div>
    </section>

    <footer className={styles.footer}>
      <button className={styles.navButton} disabled={day===0} onClick={()=>nav(day-1)}>← Previous</button>
      <select className={styles.daySelect} value={day} onChange={event=>nav(+event.target.value)}>{DAYS.map((item,index)=><option key={item.day} value={index}>Day {item.day}</option>)}</select>
      <button className={styles.navButton} disabled={day===29} onClick={()=>nav(day+1)}>Next →</button>
    </footer>
  </main>;
}

function Panel({title,children}:{title:string;children:React.ReactNode}){return <section className={styles.panel}><div className={styles.sectionLabel}>{title}</div>{children}</section>}
function Metric({a,b}:{a:string;b:string}){return <div className={styles.metric}><span className={styles.metricLabel}>{a}</span><strong className={styles.metricValue}>{b}</strong></div>}
function Row({n,text}:{n:string;text:string}){return <div className={styles.task}><span>{n}</span><span>{text}</span></div>}
function Heading({plan}:{plan:(typeof DAYS)[number]}){return <div className={styles.dayTop}><div><div className={styles.date}>Day {plan.day} of 30</div><h2 className={styles.focus}>{plan.focus}</h2></div><div className={styles.phase}>{plan.phase}</div></div>}
function Checklist({title,items,prefix,done,toggle}:{title:string;items:string[];prefix:string;done:Record<string,boolean>;toggle:(key:string)=>void}){return <Panel title={title}><div className={styles.list}>{items.map((item,index)=>{const key=`${prefix}${index}`;return <label className={`${styles.task} ${done[key]?styles.taskDone:""}`} key={item}><input className={styles.checkbox} type="checkbox" checked={!!done[key]} onChange={()=>toggle(key)}/><span>{item}</span></label>})}</div></Panel>}
function Meals({day,done,toggle}:{day:number;done:Record<string,boolean>;toggle:(key:string)=>void}){return <Panel title="Today's meals"><div className={styles.list}>{DAYS[day].meals.map((meal,index)=>{const key=`${day}:m${index}`;return <label className={`${styles.task} ${done[key]?styles.taskDone:""}`} key={meal.name}><input className={styles.checkbox} type="checkbox" checked={!!done[key]} onChange={()=>toggle(key)}/><span><b>{meal.name} · {meal.protein} g</b><br/><span className={styles.smallText}>{meal.food}</span></span></label>})}</div></Panel>}
