'use client';
import { useEffect, useState } from 'react';

type Notification = { id:string; type:string; title:string; body:string; entity_type:string|null; entity_id:string|null; read_at:string|null; created_at:string };

export function Notifications() {
  const [items,setItems]=useState<Notification[]>([]);
  const [open,setOpen]=useState(false);
  const load=async()=>{ const res=await fetch('/api/notifications',{cache:'no-store'}); if(res.ok){ const data=await res.json(); setItems(data.notifications ?? []); } };
  useEffect(()=>{void load();},[]);
  const unread=items.filter((item)=>!item.read_at).length;
  const mark=async(id:string)=>{await fetch('/api/notifications',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});setItems((rows)=>rows.map((row)=>row.id===id?{...row,read_at:new Date().toISOString()}:row));};
  const markAll=async()=>{await fetch('/api/notifications',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({all:true})});setItems((rows)=>rows.map((row)=>({...row,read_at:row.read_at||new Date().toISOString()})));};
  return <div className="notification-center"><button className="notification-trigger" onClick={()=>setOpen((value)=>!value)} aria-label="Notifications">🔔{unread>0&&<span>{unread>9?'9+':unread}</span>}</button>{open&&<div className="notification-panel"><div className="notification-panel-head"><strong>Notifications</strong>{unread>0&&<button onClick={()=>void markAll()}>Tout lire</button>}</div>{!items.length?<p className="notification-empty">Aucune notification.</p>:items.map((item)=><button key={item.id} className={`notification-item ${item.read_at?'read':''}`} onClick={()=>!item.read_at&&void mark(item.id)}><strong>{item.title}</strong><small>{item.body}</small><time>{new Date(item.created_at).toLocaleString('fr-FR')}</time></button>)}</div>}</div>;
}
