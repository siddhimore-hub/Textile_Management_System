#!/usr/bin/env bash
# End-to-end flow check against a running backend (npm run dev:backend). Uses a fresh DB: run `npm run db:reset` first.
API=${API:-http://localhost:4000/api}
# Log in as the owner (default seeded password; override with SMOKE_EMAIL / SMOKE_PASSWORD).
TOKEN=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"${SMOKE_EMAIL:-owner@everest.test}\",\"password\":\"${SMOKE_PASSWORD:-everest123}\"}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] || { echo "Login failed. Reset the DB (npm run db:reset) or set SMOKE_PASSWORD."; exit 1; }
j() { curl -s -X "$1" "$API$2" -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" ${3:+-d "$3"}; echo; }
TOMORROW=$(date -d '+7 days' +%F 2>/dev/null || date -v+7d +%F)
echo "1 receive yarn";      j POST /receipts '{"material_id":1,"supplier_id":1,"qty":500,"lot_no":"LOT-1"}'
echo "2 create order";      j POST /orders "{\"buyer_id\":1,\"fabric_type\":\"poplin\",\"colour\":\"white\",\"qty_metres\":1000,\"price_per_metre\":120,\"deadline\":\"$TOMORROW\",\"requirements\":[{\"material_id\":1,\"qty_required\":300}]}"
echo "3 feasibility";       j GET /orders/1/feasibility
echo "4 issue yarn";        j POST /stock/issue '{"material_id":1,"order_id":1,"qty":300}'
echo "5 spin job";         j POST /jobs '{"order_id":1,"machine_id":1,"shift":"morning"}'
echo "6 spin output";      j POST /jobs/1/output '{"metres":500}'
echo "7 finish spin";      j POST /jobs/1/finish
echo "8 loom job";         j POST /jobs '{"source_job_id":1,"machine_id":2,"shift":"morning"}'
echo "9 loom output";      j POST /jobs/2/output '{"metres":500}'
echo "10 finish loom";     j POST /jobs/2/finish
echo "11 dyeing job";      j POST /jobs '{"source_job_id":2,"machine_id":4,"shift":"morning"}'
echo "12 dyeing output";   j POST /jobs/3/output '{"metres":500}'
echo "13 finish dyeing";   j POST /jobs/3/finish
echo "14 finishing job";   j POST /jobs '{"source_job_id":3,"machine_id":5,"shift":"morning"}'
echo "15 finish output";   j POST /jobs/4/output '{"metres":500}'
echo "16 complete finishing"; j POST /jobs/4/finish
echo "17 create roll";     j POST /rolls '{"job_card_id":4,"metres":500}'
echo "18 roll over available should FAIL"; j POST /rolls '{"job_card_id":4,"metres":1}'
echo "19 inspect: no defect on reject should FAIL"; j POST /rolls/1/inspect '{"result":"reject"}'
echo "20 inspect pass";    j POST /rolls/1/inspect '{"result":"pass","inspector":"QC One"}'
echo "21 dispatch";        j POST /dispatches '{"order_id":1,"roll_ids":[1],"vehicle_no":"TN09AB1234"}'
echo "22 dispatch again should FAIL"; j POST /dispatches '{"order_id":1,"roll_ids":[1],"vehicle_no":"TN09AB1234"}'
echo "23 orders (derived status)"; j GET /orders
echo "24 dashboard";       j GET /dashboard
echo "25 finance";         j GET /finance/summary
echo "26 trend + at-risk";   j GET /dashboard/trend?days=3; j GET /dashboard/at-risk
echo "27 roll label data";   j GET /rolls/labels?ids=1; j GET /rolls/by-code/R-$(date +%Y)-00001
echo "28 purchase suggestions"; j GET /purchase-requests/suggestions
echo "29 notifications";     j GET /notifications
echo "30 audit log (owner)"; j GET /audit-logs?limit=3
echo "31 no token should FAIL"; curl -s "$API/orders"; echo
