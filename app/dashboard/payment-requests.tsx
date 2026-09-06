'use client';

import { useEffect, useState } from 'react';

type RequestRow = { id:string; requester_user_id:string; payer_user_id:string; amount:string; currency:string; description:string|null; status:string; expires_at:string|null; created_at:string };
type Wallet = { id:string; currency:string; balance:string; status:string };

export function PaymentRequests() {
  const [requests,setRequests]=useState<RequestRow[]>([]);
  const [wallets,setWallets]=useState<Wallet[]>([]);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState('');
  const load=async()=>{ const [r,w]=await Promise.all([fetch('/api/payment-requests',{cache:'no-store'}),fetch('/api/wallet/currencies',{cache:'no-store'})]); if(r.ok)setRequests((await r.json()).paymentRequests); if(w.ok)setWallets((await w.json()).wallets); };
  useEffect(()=>{ void load(); },[]);
  const act=async(id:string,action:'accept'|'reject',walletId?:string)=>{ setBusy(id+action);setError(''); try { const res=await fetch(`/api/payment-requests/${id}/${action}`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()+crypto.randomUUID()},body:action==='accept'?JSON.stringify({payerWalletId:walletId}):'{}'}); const data=await res.json(); if(!res.ok)throw new Error(data.error||'Opération impossible'); await load(); } catch(e){setError(e instanceof Error?e.message:'Opération impossible');} finally{setBusy(null);} };
  const incoming=requests.filter(r=>r.payer_user_id && r.status==='pending');
  if(!incoming.length&&!error)return null;
  return <section className="payment-requests-section"><div className="transactions-heading"><div><small>PAIEMENTS</small><h2>Demandes reçues</h2></div><span>{incoming.length}</span></div>{error&&<p className="form-error">{error}</p>}<div className="payment-request-list">{incoming.map(r=>{const matching=wallets.filter(w=>w.status==='active');return <article key={r.id} className="payment-request-card"><div><strong>{Number(r.amount).toLocaleString('fr-FR')} {r.currency}</strong><small>{r.description||'Demande de paiement'}</small></div><div className="payment-request-actions"><select defaultValue={matching.find(w=>w.currency===r.currency)?.id||matching[0]?.id||''} id={`wallet-${r.id}`}><option value="">Choisir le portefeuille</option>{matching.map(w=><option key={w.id} value={w.id}>{w.currency} · {Number(w.balance).toLocaleString('fr-FR')}</option>)}</select><button disabled={busy===r.id+'accept'} onClick={()=>{const el=document.getElementById(`wallet-${r.id}`) as HTMLSelectElement|null; void act(r.id,'accept',el?.value)}}>Accepter</button><button disabled={busy===r.id+'reject'} onClick={()=>void act(r.id,'reject')}>Refuser</button></div></article>})}</div></section>;
}
