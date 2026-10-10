#!/usr/bin/env bash
# End-to-end flow check against a running backend (npm run dev:backend). Uses a fresh DB: run `npm run db:reset` first.
API=${API:-http://localhost:4000/api}
j() { curl -s -X "$1" "$API$2" -H 'Content-Type: application/json' ${3:+-d "$3"}; echo; }
TOMORROW=$(date -d '+7 days' +%F 2>/dev/null || date -v+7d +%F)
echo "1 receive yarn";      j POST /receipts '{"material_id":1,"supplier_id":1,"qty":500,"lot_no":"LOT-1"}'
echo "2 create order";      j POST /orders "{\"buyer_id\":1,\"fabric_type\":\"poplin\",\"colour\":\"white\",\"qty_metres\":1000,\"price_per_metre\":120,\"deadline\":\"$TOMORROW\",\"requirements\":[{\"material_id\":1,\"qty_required\":300}]}"
echo "3 feasibility";       j GET /orders/1/feasibility
echo "4 issue yarn";        j POST /stock/issue '{"material_id":1,"order_id":1,"qty":300}'
echo "5 assign loom";       j POST /jobs '{"order_id":1,"machine_id":2,"shift":"morning"}'
echo "6 log output";        j POST /jobs/1/output '{"metres":500}'
echo "7 create roll";       j POST /rolls '{"job_card_id":1,"metres":500}'
echo "8 inspect: no defect on reject should FAIL"; j POST /rolls/1/inspect '{"result":"reject"}'
echo "9 inspect pass";      j POST /rolls/1/inspect '{"result":"pass","inspector":"QC One"}'
echo "10 finish job";       j POST /jobs/1/finish
echo "11 dispatch";         j POST /dispatches '{"order_id":1,"roll_ids":[1],"vehicle_no":"TN09AB1234"}'
echo "12 dispatch again should FAIL"; j POST /dispatches '{"order_id":1,"roll_ids":[1],"vehicle_no":"TN09AB1234"}'
echo "13 orders (derived status)"; j GET /orders
echo "14 dashboard";        j GET /dashboard
echo "15 finance";          j GET /finance/summary
