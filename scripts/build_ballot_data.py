import os
import json
import urllib.request

SEED_FILE = os.path.join(os.path.dirname(__file__), "seed_election_data.json")
PUBLIC_DATA_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "public", "data"))
ZIPS_DIR = os.path.join(PUBLIC_DATA_DIR, "zips")

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

def ensure_directories():
    os.makedirs(ZIPS_DIR, exist_ok=True)

def summarize_candidate_with_gemini(candidate_name, party, raw_bio, api_key):
    """Summarizes a candidate bio into a crisp 2-3 line overview using Gemini API if key is present."""
    if not api_key:
        return raw_bio

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}"
    prompt = f"Summarize candidate '{candidate_name}' ({party}) in 2-3 concise, neutral, non-partisan sentences based on this profile: {raw_bio}"
    
    payload = {
        "contents": [{"parts": [{"text": prompt}]}]
    }
    
    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=10) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            summary = res_data['candidates'][0]['content']['parts'][0]['text'].strip()
            return summary
    except Exception as e:
        print(f"  [AI Warning] Falling back to raw bio for {candidate_name}: {e}")
        return raw_bio

def build_data():
    ensure_directories()
    
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
        print("[AI] GEMINI_API_KEY detected. Running AI batch candidate summarization...")
    else:
        print("[Info] No GEMINI_API_KEY found. Building JSON files using seed bios.")

    with open(SEED_FILE, "r", encoding="utf-8") as f:
        seed_db = json.load(f)

    built = 0
    for zip_code, dist_info in seed_db.items():
        # Only seed entries verified for a specific election are published. Older
        # entries without "election" metadata would overwrite curated ZIP files.
        if "election" not in dist_info:
            print(f"[Skip] ZIP {zip_code} has no 'election' metadata; leaving public/data/zips/{zip_code}.json untouched.")
            continue

        print(f"[Build] Processing ZIP {zip_code} ({dist_info['locationName']})...")
        
        # Process candidates
        for race in dist_info.get("races", []):
            for cand in race.get("candidates", []):
                raw_bio = cand.get("rawBio", cand.get("desc", ""))
                if api_key and "rawBio" in cand:
                    cand["desc"] = summarize_candidate_with_gemini(cand["name"], cand["party"], raw_bio, api_key)
                elif "desc" not in cand:
                    cand["desc"] = raw_bio

        # Save individual ZIP JSON file
        zip_file_path = os.path.join(ZIPS_DIR, f"{zip_code}.json")
        with open(zip_file_path, "w", encoding="utf-8") as f_out:
            json.dump(dist_info, f_out, indent=2)
        built += 1

    # Rebuild manifest.json from every ZIP file on disk so skipped ZIPs stay listed
    manifest = {}
    for file_name in sorted(os.listdir(ZIPS_DIR)):
        if not file_name.endswith(".json"):
            continue
        with open(os.path.join(ZIPS_DIR, file_name), "r", encoding="utf-8") as f_zip:
            dist_info = json.load(f_zip)
        manifest[file_name[:-5]] = {
            "state": dist_info.get("state"),
            "locationName": dist_info.get("locationName"),
            "districtText": dist_info.get("districtText"),
            "election": dist_info.get("election"),
            "raceCount": len(dist_info.get("races", []))
        }

    manifest_path = os.path.join(PUBLIC_DATA_DIR, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f_manifest:
        json.dump(manifest, f_manifest, indent=2)

    print(f"[Success] Built {built} ZIP dataset files; manifest.json lists {len(manifest)} ZIPs.")

if __name__ == "__main__":
    build_data()
