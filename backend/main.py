"""
Phantom Energy Cost Calculator — FastAPI Backend
=================================================
Routes:
  POST /calculate   — Perform cost & CO2 calculations (JWT-protected)
  GET  /history     — Fetch user's past calculations (JWT-protected)
  GET  /health      — Health check
"""

import os
import jwt
from datetime import datetime
from typing import List, Optional
from functools import wraps

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import create_client, Client

# ── Load environment ────────────────────────────────────────
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://127.0.0.1:5500")

# ── CO2 Emission Factor ────────────────────────────────────
CO2_FACTOR_KG_PER_KWH = 0.71  # Indian grid standard

# ── Supabase Client (service-role for backend operations) ──
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# ── FastAPI App ─────────────────────────────────────────────
app = FastAPI(
    title="Phantom Energy Cost Calculator API",
    version="1.0.0",
    description="Calculate standby energy cost and CO2 emissions.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:5500", "http://127.0.0.1:5500"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── JWT Verification ───────────────────────────────────────
def verify_jwt(authorization: str) -> dict:
    """Verify a Supabase JWT and return the payload."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    
    token = authorization.replace("Bearer ", "")
    
    try:
        # Instead of manually parsing the esoteric ES256 algorithm with keys,
        # we securely ask Supabase's Auth API if the token is valid.
        user_response = supabase.auth.get_user(token)
        
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Token rejected by Supabase Auth")
        
        # We return a dictionary that acts like the JWT payload so our routes still work seamlessly
        return {"sub": user_response.user.id}
        
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


# ── Pydantic Models ────────────────────────────────────────
class ApplianceInput(BaseModel):
    appliance_id: int
    bee_star_rating: Optional[str] = None
    appliance_age: str
    avg_yearly_consumption_w: Optional[float] = None
    idle_hours_per_day: float = Field(gt=0, le=24)
    standby_watts: float = Field(gt=0)


class CalculateRequest(BaseModel):
    room_id: str
    energy_rate: float = Field(gt=0, description="₹ per kWh")
    appliances: List[ApplianceInput]


class ApplianceResult(BaseModel):
    appliance_id: int
    appliance_name: str
    category: str
    standby_watts_used: float
    idle_hours_per_day: float
    idle_kwh_day: float
    cost_day: float
    cost_month: float
    cost_year: float
    co2_day_kg: float
    co2_month_kg: float
    co2_year_kg: float


class CalculateResponse(BaseModel):
    calculation_id: str
    total_standby_watts: float
    total_idle_kwh_day: float
    cost_day: float
    cost_month: float
    cost_year: float
    co2_day_kg: float
    co2_month_kg: float
    co2_year_kg: float
    leakage_score: str
    energy_rate_used: float
    appliance_results: List[ApplianceResult]


# ── Age-based degradation multiplier ──────────────────────
def get_age_multiplier(age: str) -> float:
    """Older appliances tend to draw more standby power due to degradation."""
    multipliers = {
        "less than 1 year": 1.0,
        "less than 3 years": 1.05,
        "less than 5 years": 1.10,
        "less than 10 years": 1.20,
        "10+ years": 1.35,
    }
    return multipliers.get(age, 1.0)


# ── Leakage Score ─────────────────────────────────────────
def get_leakage_score(total_standby_watts: float) -> str:
    if total_standby_watts < 15:
        return "Low"
    elif total_standby_watts <= 50:
        return "Medium"
    else:
        return "High"


# ── Routes ─────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@app.post("/calculate", response_model=CalculateResponse)
async def calculate(
    body: CalculateRequest,
    authorization: str = Header(None),
):
    """
    Perform phantom energy cost and CO2 calculation.
    All math is done server-side for integrity.
    """
    # 1. Verify JWT
    payload = verify_jwt(authorization)
    user_id = payload.get("sub")

    # 2. Verify room ownership
    room_resp = supabase.table("rooms").select("*").eq("id", body.room_id).eq("user_id", user_id).execute()
    if not room_resp.data:
        raise HTTPException(status_code=403, detail="Room not found or access denied")

    # 3. Fetch appliance reference data for names
    appliance_ids = [a.appliance_id for a in body.appliances]
    app_resp = supabase.table("seed_appliances").select("*").in_("id", appliance_ids).execute()
    appliance_map = {a["id"]: a for a in app_resp.data}

    # 4. Calculate per-appliance metrics
    appliance_results = []
    total_standby_watts = 0.0
    total_idle_kwh_day = 0.0
    total_cost_day = 0.0
    total_co2_day = 0.0

    for appl in body.appliances:
        ref = appliance_map.get(appl.appliance_id)
        if not ref:
            raise HTTPException(status_code=400, detail=f"Appliance ID {appl.appliance_id} not found")

        # Apply age degradation to standby watts
        age_mult = get_age_multiplier(appl.appliance_age)
        effective_standby_w = appl.standby_watts * age_mult

        # idle kWh per day = (standby watts × idle hours) / 1000
        idle_kwh_day = (effective_standby_w * appl.idle_hours_per_day) / 1000.0

        # Financial cost
        cost_day = idle_kwh_day * body.energy_rate
        cost_month = cost_day * 30
        cost_year = cost_day * 365

        # CO2 emissions
        co2_day = idle_kwh_day * CO2_FACTOR_KG_PER_KWH
        co2_month = co2_day * 30
        co2_year = co2_day * 365

        total_standby_watts += effective_standby_w
        total_idle_kwh_day += idle_kwh_day
        total_cost_day += cost_day
        total_co2_day += co2_day

        appliance_results.append(ApplianceResult(
            appliance_id=appl.appliance_id,
            appliance_name=ref["name"],
            category=ref["category"],
            standby_watts_used=round(effective_standby_w, 2),
            idle_hours_per_day=appl.idle_hours_per_day,
            idle_kwh_day=round(idle_kwh_day, 4),
            cost_day=round(cost_day, 2),
            cost_month=round(cost_month, 2),
            cost_year=round(cost_year, 2),
            co2_day_kg=round(co2_day, 4),
            co2_month_kg=round(co2_month, 4),
            co2_year_kg=round(co2_year, 4),
        ))

    # 5. Aggregate totals
    total_cost_month = total_cost_day * 30
    total_cost_year = total_cost_day * 365
    total_co2_month = total_co2_day * 30
    total_co2_year = total_co2_day * 365
    leakage_score = get_leakage_score(total_standby_watts)

    # 6. Persist to Supabase — calculations table
    calc_insert = supabase.table("calculations").insert({
        "room_id": body.room_id,
        "total_standby_watts": round(total_standby_watts, 2),
        "total_idle_kwh_day": round(total_idle_kwh_day, 4),
        "cost_day": round(total_cost_day, 2),
        "cost_month": round(total_cost_month, 2),
        "cost_year": round(total_cost_year, 2),
        "co2_day_kg": round(total_co2_day, 4),
        "co2_month_kg": round(total_co2_month, 4),
        "co2_year_kg": round(total_co2_year, 4),
        "leakage_score": leakage_score,
        "energy_rate_used": body.energy_rate,
    }).execute()

    calc_id = calc_insert.data[0]["id"]

    # 7. Persist per-appliance line items
    line_items = []
    for i, appl in enumerate(body.appliances):
        ar = appliance_results[i]
        line_items.append({
            "calculation_id": calc_id,
            "appliance_id": appl.appliance_id,
            "bee_star_rating": appl.bee_star_rating,
            "appliance_age": appl.appliance_age,
            "avg_yearly_consumption_w": appl.avg_yearly_consumption_w,
            "idle_hours_per_day": appl.idle_hours_per_day,
            "standby_watts_used": ar.standby_watts_used,
            "idle_kwh_day": ar.idle_kwh_day,
            "cost_day": ar.cost_day,
            "co2_day_kg": ar.co2_day_kg,
        })

    supabase.table("calculation_appliances").insert(line_items).execute()

    # 8. Return response
    return CalculateResponse(
        calculation_id=calc_id,
        total_standby_watts=round(total_standby_watts, 2),
        total_idle_kwh_day=round(total_idle_kwh_day, 4),
        cost_day=round(total_cost_day, 2),
        cost_month=round(total_cost_month, 2),
        cost_year=round(total_cost_year, 2),
        co2_day_kg=round(total_co2_day, 4),
        co2_month_kg=round(total_co2_month, 4),
        co2_year_kg=round(total_co2_year, 4),
        leakage_score=leakage_score,
        energy_rate_used=body.energy_rate,
        appliance_results=appliance_results,
    )


@app.get("/history")
async def history(
    authorization: str = Header(None),
):
    """
    Return all rooms and their calculations for the authenticated user.
    """
    payload = verify_jwt(authorization)
    user_id = payload.get("sub")

    # Fetch rooms
    rooms_resp = supabase.table("rooms").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    rooms = rooms_resp.data

    result = []
    for room in rooms:
        # Fetch calculations for each room
        calcs_resp = (
            supabase.table("calculations")
            .select("*")
            .eq("room_id", room["id"])
            .order("created_at", desc=True)
            .execute()
        )
        calculations = calcs_resp.data

        # Fetch state info
        state_resp = supabase.table("seed_states").select("*").eq("id", room["state_id"]).execute()
        state_info = state_resp.data[0] if state_resp.data else None

        # For each calculation, fetch appliance line items
        for calc in calculations:
            items_resp = (
                supabase.table("calculation_appliances")
                .select("*, seed_appliances(name, category)")
                .eq("calculation_id", calc["id"])
                .execute()
            )
            calc["appliance_items"] = items_resp.data

        result.append({
            "room": room,
            "state": state_info,
            "calculations": calculations,
        })

    return {"rooms": result}


# ── Run ────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
