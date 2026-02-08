import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv, find_dotenv

# 1. Load Environment Variables
# force=True ensures we reload changes if you edit .env
load_dotenv(find_dotenv(), override=True)

url: str = os.environ.get("VITE_SUPABASE_URL")
# MUST use Service Role Key to bypass RLS security on the Users table
key: str = os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY") 


if not url:
    print("Error: VITE_SUPABASE_URL is missing.")
if not key:
    print("Error: VITE_SUPABASE_SERVICE_ROLE_KEY is missing.")

# 2. Initialize Supabase
supabase: Client = create_client(url, key)

app = FastAPI()

# 3. CORS - Allow Frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/login")
async def login(user_data: LoginRequest):
    print(f"Login attempt for: {user_data.username}")

    try:
        # A. Query the table
        # Try "Users" first. If you get an error saying table not found, try "users" (lowercase).
        response = supabase.table("Users").select("*").eq("username", user_data.username).execute()

        # B. Check if User Exists
        if not response.data:
            print(" User not found in DB.")
            # Debug tip: If this happens, your table name might be lowercase "users"
            raise HTTPException(status_code=401, detail="User not found")

        user = response.data[0]
        
        db_password = str(user.get("Password"))
        input_password = str(user_data.password)

        print(f"DB Password: {db_password} | Input: {input_password}")

        if db_password != input_password:
             print(" Password mismatch")
             raise HTTPException(status_code=401, detail="Invalid password")

        print(" Login successful")
        return {
            "message": "Login successful",
            "user": {
                "id": user.get("id"),
                "username": user.get("username")
            }
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f" Server Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))