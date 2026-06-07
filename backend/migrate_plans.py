#!/usr/bin/env python3
# migrate_plans.py
import os
import re
from pymongo import MongoClient

def main():
    # Obtener la URL de MongoDB de las variables de entorno
    mongo_url = os.environ.get('MONGO_URL')
    if not mongo_url:
        print("Error: MONGO_URL not set in environment")
        return

    # Conectar usando pymongo (síncrono)
    client = MongoClient(mongo_url)
    try:
        db = client.get_default_database()
    except Exception:
        db_name = os.environ.get('DB_NAME', 'ventura_laundry')
        db = client[db_name]

    plans_collection = db.membership_plans

    # Encontrar todos los planes
    plans = plans_collection.find({})
    updated = 0
    for plan in plans:
        if 'lbs_allowance' in plan:
            print(f"✔ {plan['name']} already has lbs_allowance = {plan['lbs_allowance']}")
            continue

        # Intentar extraer el número de las features
        lbs = None
        for feature in plan.get('features', []):
            match = re.search(r'(\d+)\s*lb', feature.lower())
            if match:
                lbs = int(match.group(1))
                break
        if lbs is None:
            name_lower = plan['name'].lower()
            if 'elite' in name_lower or 'concierge' in name_lower:
                lbs = 120
            elif 'family' in name_lower:
                lbs = 90
            else:
                lbs = 60

        # Actualizar el documento
        result = plans_collection.update_one(
            {'_id': plan['_id']},
            {'$set': {'lbs_allowance': lbs}}
        )
        if result.modified_count:
            updated += 1
            print(f"✅ Updated {plan['name']} -> lbs_allowance = {lbs}")
        else:
            print(f"⚠️ Could not update {plan['name']}")

    print(f"\nMigration completed. Updated {updated} plans.")
    client.close()

if __name__ == '__main__':
    main()