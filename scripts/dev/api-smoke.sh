#!/usr/bin/env bash
# Smoke test of the scheduler APIs against a running dev server.
B=${1:-http://localhost:3000}
echo "--- recommend (Day 1, after keynote)"
curl -s -X POST $B/api/recommend -H 'Content-Type: application/json' -d '{"day":1,"window":{"start":1794333600000,"end":1794360600000},"interests":{"security":2,"agentic":1},"favoriteSpeakers":[],"plan":["k1"],"blocks":[]}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('source',j.source,'prev',j.prevId);for(const r of j.recommended)console.log(' REC',r.sessionId,r.score,r.reasons.join(' | '));console.log(' also',j.also.length,'clashing',j.clashing.length)})"
echo "--- import sample ics"
curl -s -X POST $B/api/import-ics -H 'Content-Type: application/json' -d '{"sample":true}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);for(const b of j.blocks)console.log(' ',b.day,b.start,b.end,b.title,b.offsite)})"
