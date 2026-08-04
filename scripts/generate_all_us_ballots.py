import os
import json
import urllib.request
import urllib.parse
import time

PUBLIC_DATA_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "public", "data"))
ZIPS_DIR = os.path.join(PUBLIC_DATA_DIR, "zips")

def ensure_directories():
    os.makedirs(ZIPS_DIR, exist_ok=True)

# Comprehensive US State & Zip Code Mapping Database
US_STATE_DISTRICT_TEMPLATES = {
    # NORTHEAST
    "NY": { "state": "New York", "city": "New York, NY", "cd": "Congressional District 12", "zip": "10001", "races": ["US Representative CD 12", "NY State Senate SD 28", "NY State Assembly AD 75", "Manhattan District Attorney"] },
    "MA": { "state": "Massachusetts", "city": "Boston, MA", "cd": "Congressional District 7", "zip": "02108", "races": ["US Representative CD 7", "MA State Senate Norfolk & Suffolk", "Suffolk County Sheriff"] },
    "PA": { "state": "Pennsylvania", "city": "Philadelphia, PA", "cd": "Congressional District 3", "zip": "19102", "races": ["US Representative CD 3", "PA State Senate SD 1", "PA House HD 182", "Philadelphia District Attorney"] },
    
    # SOUTH
    "FL": { "state": "Florida", "city": "Miami, FL", "cd": "Congressional District 27", "zip": "33139", "races": ["US Representative CD 27", "FL State Senate SD 38", "FL State House HD 113", "Miami-Dade County Mayor"] },
    "GA": { "state": "Georgia", "city": "Atlanta, GA", "cd": "Congressional District 5", "zip": "30303", "races": ["US Representative CD 5", "GA State Senate SD 39", "GA State House HD 58", "Fulton County District Attorney"] },
    "NC": { "state": "North Carolina", "city": "Raleigh, NC", "cd": "Congressional District 2", "zip": "27601", "races": ["US Representative CD 2", "NC State Senate SD 15", "NC State House HD 38", "Wake County Sheriff"] },

    # MIDWEST
    "IL": { "state": "Illinois", "city": "Chicago, IL", "cd": "Congressional District 7", "zip": "60601", "races": ["US Representative CD 7", "IL State Senate SD 13", "IL State House HD 26", "Cook County State's Attorney"] },
    "OH": { "state": "Ohio", "city": "Columbus, OH", "cd": "Congressional District 3", "zip": "43215", "races": ["US Representative CD 3", "OH State Senate SD 15", "OH State House HD 18", "Franklin County Prosecutor"] },
    "MI": { "state": "Michigan", "city": "Detroit, MI", "cd": "Congressional District 13", "zip": "48226", "races": ["US Representative CD 13", "MI State Senate SD 1", "MI State House HD 4", "Wayne County Prosecutor"] },

    # WEST
    "CA": { "state": "California", "city": "San Francisco, CA", "cd": "Congressional District 11", "zip": "94102", "races": ["US Representative CD 11", "CA State Senate SD 11", "CA State Assembly AD 17", "SF District Attorney"] },
    "WA": { "state": "Washington", "city": "Seattle, WA", "cd": "Congressional District 7", "zip": "98116", "races": ["US Representative CD 7", "WA State Senate SD 34", "WA House Pos 1 & 2", "King County Assessor"] },
    "CO": { "state": "Colorado", "city": "Denver, CO", "cd": "Congressional District 1", "zip": "80202", "races": ["US Representative CD 1", "CO State Senate SD 34", "CO State House HD 8", "Denver District Attorney"] },
    "AZ": { "state": "Arizona", "city": "Phoenix, AZ", "cd": "Congressional District 3", "zip": "85001", "races": ["US Representative CD 3", "AZ Legislative District 5", "Maricopa County Sheriff"] }
}

def generate_district_json(state_code, template, zip_code):
    state_name = template["state"]
    city_name = template["city"]
    cd_name = template["cd"]

    return {
        "state": state_name,
        "locationName": city_name,
        "districtText": f"{state_name} Statewide | {cd_name}",
        "races": [
          {
            "shortTitle": f"US Rep {cd_name.split()[-1]}",
            "type": "Federal Partisan Office • Vote for One",
            "category": "Federal Office",
            "title": f"United States Representative, {cd_name}",
            "overview": f"Represents the residents of {city_name} and {state_name} in the U.S. House of Representatives. Responsible for federal lawmaking, national budget appropriations, constituent advocacy, and federal agency oversight.",
            "sources": [
              { "label": f"🔗 {state_name} Secretary of State", "url": "https://ballotpedia.org" },
              { "label": "🔗 Vote411 Election Guide", "url": "https://www.vote411.org" }
            ],
            "candidates": [
              { "name": "Democratic Nominee", "party": "Democratic Party", "partyClass": "party-dem", "desc": f"Democratic candidate focusing on healthcare access, education funding, public infrastructure, and environmental policy for {state_name}.", "site": "https://www.vote411.org" },
              { "name": "Republican Nominee", "party": "Republican Party", "partyClass": "party-rep", "desc": f"Republican candidate advocating for fiscal discipline, tax reduction, economic growth, public safety, and streamlined regulation in {state_name}.", "site": "https://www.vote411.org" }
            ]
          },
          {
            "shortTitle": "State Senate",
            "type": "State Partisan Office • Vote for One",
            "category": "State Legislative Office",
            "title": f"{state_name} State Senate",
            "overview": f"Represents local district constituents in the {state_name} State Senate, voting on state legislation, state taxes, and public school budgets.",
            "sources": [{ "label": f"🔗 {state_name} General Assembly", "url": "https://ballotpedia.org" }],
            "candidates": [
              { "name": "Incumbent Senator", "party": "Democratic Party", "partyClass": "party-dem", "desc": f"Incumbent legislator advocating for local community investments, healthcare, and education in {state_name}.", "site": "https://ballotpedia.org" }
            ]
          },
          {
            "shortTitle": "State House",
            "type": "State Partisan Office • Vote for One",
            "category": "State Legislative Office",
            "title": f"{state_name} House of Representatives",
            "overview": f"Serves in the {state_name} House of Representatives crafting state policies and constituent services.",
            "sources": [{ "label": f"🔗 {state_name} House", "url": "https://ballotpedia.org" }],
            "candidates": [
              { "name": "State Representative", "party": "Democratic Party", "partyClass": "party-dem", "desc": f"Focuses on local job creation, public safety, and constituent advocacy in {city_name}.", "site": "https://ballotpedia.org" }
            ]
          },
          {
            "shortTitle": "County Executive / Prosecutor",
            "type": "County Office • Vote for One",
            "category": "County Office",
            "title": f"{city_name} County Executive / Prosecutor",
            "overview": f"Oversees countywide criminal justice, public health, law enforcement, and regional services.",
            "sources": [{ "label": "🔗 County Board of Elections", "url": "https://ballotpedia.org" }],
            "candidates": [
              { "name": "County Candidate A", "party": "Nonpartisan", "partyClass": "party-non", "desc": "Focuses on court efficiency, victim advocacy, public safety, and community diversion programs.", "site": "https://ballotpedia.org" },
              { "name": "County Candidate B", "party": "Nonpartisan", "partyClass": "party-non", "rawBio": "Focuses on administrative reforms, fiscal oversight, and law enforcement support.", "site": "https://ballotpedia.org" }
            ]
          }
        ]
    }

def bulk_generate():
    ensure_directories()
    print("[Nationwide Build] Bulk generating U.S. election ballot datasets...")

    count = 0
    manifest = {}

    for st_code, template in US_STATE_DISTRICT_TEMPLATES.items():
        zip_code = template["zip"]
        dist_data = generate_district_json(st_code, template, zip_code)
        
        file_path = os.path.join(ZIPS_DIR, f"{zip_code}.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(dist_data, f, indent=2)

        manifest[zip_code] = {
            "state": template["state"],
            "locationName": template["city"],
            "districtText": dist_data["districtText"],
            "raceCount": len(dist_data["races"])
        }
        count += 1

    manifest_path = os.path.join(PUBLIC_DATA_DIR, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f_m:
        json.dump(manifest, f_m, indent=2)

    print(f"[Success] Generated {count} regional state ballot datasets in public/data/zips/!")

if __name__ == "__main__":
    bulk_generate()
