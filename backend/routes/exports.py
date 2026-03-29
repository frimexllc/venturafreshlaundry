"""CSV Export endpoints"""
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
import csv
import io
import json

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api", tags=["Export"])


async def _export_collection(collection, filename):
    items = await collection.find({}, {"_id": 0}).to_list(10000)
    output = io.StringIO()
    if items:
        all_keys = set()
        for item in items:
            if isinstance(item, dict):
                all_keys.update([str(k) for k in item.keys()])
        fieldnames = sorted(list(all_keys))
        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for item in items:
            row = {}
            for key in fieldnames:
                value = item.get(key, "")
                if isinstance(value, (dict, list)):
                    value = json.dumps(value, default=str)
                elif value is None:
                    value = ""
                elif not isinstance(value, (str, int, float, bool)):
                    value = str(value)
                row[key] = value
            writer.writerow(row)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/customers")
async def export_customers_csv(current_user: dict = Depends(get_current_user)):
    return await _export_collection(db.customers, "customers.csv")


@router.get("/export/orders")
async def export_orders_csv(current_user: dict = Depends(get_current_user)):
    return await _export_collection(db.orders, "orders.csv")


@router.get("/export/leads")
async def export_leads_csv(current_user: dict = Depends(get_current_user)):
    return await _export_collection(db.leads, "leads.csv")


@router.get("/export/quotes")
async def export_quotes_csv(current_user: dict = Depends(get_current_user)):
    return await _export_collection(db.quotes, "quotes.csv")


@router.get("/export/tickets")
async def export_tickets_csv(current_user: dict = Depends(get_current_user)):
    return await _export_collection(db.tickets, "tickets.csv")
