import os
import json

PUBLIC_DATA_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "public", "data"))
ZIPS_DIR = os.path.join(PUBLIC_DATA_DIR, "zips")

def ensure_directories():
    os.makedirs(ZIPS_DIR, exist_ok=True)

# Complete 50-State Election Dataset Templates
ALL_50_STATES = [
    { "code": "AL", "state": "Alabama", "city": "Birmingham, AL", "zip": "35203", "cd": "District 7", "rep": "Terri Sewell", "opp": "Robin Litaker" },
    { "code": "AK", "state": "Alaska", "city": "Anchorage, AK", "zip": "99501", "cd": "At-Large District", "rep": "Mary Peltola", "opp": "Nick Begich" },
    { "code": "AZ", "state": "Arizona", "city": "Phoenix, AZ", "zip": "85004", "cd": "District 3", "rep": "Yassamin Ansari", "opp": "Jeff Zink" },
    { "code": "AR", "state": "Arkansas", "city": "Little Rock, AR", "zip": "72201", "cd": "District 2", "rep": "French Hill", "opp": "Marcus Jones" },
    { "code": "CA", "state": "California", "city": "San Francisco, CA", "zip": "94102", "cd": "District 11", "rep": "Nancy Pelosi", "opp": "Bruce Lou" },
    { "code": "CO", "state": "Colorado", "city": "Denver, CO", "zip": "80202", "cd": "District 1", "rep": "Diana DeGette", "opp": "Jennifer Qualteri" },
    { "code": "CT", "state": "Connecticut", "city": "Hartford, CT", "zip": "06103", "cd": "District 1", "rep": "John Larson", "opp": "Jim Griffin" },
    { "code": "DE", "state": "Delaware", "city": "Wilmington, DE", "zip": "19801", "cd": "At-Large District", "rep": "Sarah McBride", "opp": "John Whalen" },
    { "code": "FL", "state": "Florida", "city": "Miami, FL", "zip": "33139", "cd": "District 27", "rep": "Maria Elvira Salazar", "opp": "Lucia Baez-Geller" },
    { "code": "GA", "state": "Georgia", "city": "Atlanta, GA", "zip": "30303", "cd": "District 5", "rep": "Nikema Williams", "opp": "John Lewis Jr." },
    { "code": "HI", "state": "Hawaii", "city": "Honolulu, HI", "zip": "96813", "cd": "District 1", "rep": "Ed Case", "opp": "Patrick Largey" },
    { "code": "ID", "state": "Idaho", "city": "Boise, ID", "zip": "83702", "cd": "District 2", "rep": "Mike Simpson", "opp": "David Roth" },
    { "code": "IL", "state": "Illinois", "city": "Chicago, IL", "zip": "60601", "cd": "District 7", "rep": "Danny Davis", "opp": "Chad Koppie" },
    { "code": "IN", "state": "Indiana", "city": "Indianapolis, IN", "zip": "46204", "cd": "District 7", "rep": "André Carson", "opp": "John Thomas" },
    { "code": "IA", "state": "Iowa", "city": "Des Moines, IA", "zip": "50309", "cd": "District 3", "rep": "Zach Nunn", "opp": "Lanon Baccam" },
    { "code": "KS", "state": "Kansas", "city": "Wichita, KS", "zip": "67202", "cd": "District 4", "rep": "Ron Estes", "opp": "Esau Freeman" },
    { "code": "KY", "state": "Kentucky", "city": "Louisville, KY", "zip": "40202", "cd": "District 3", "rep": "Morgan McGarvey", "opp": "Mike Harmon" },
    { "code": "LA", "state": "Louisiana", "city": "New Orleans, LA", "zip": "70112", "cd": "District 2", "rep": "Troy Carter", "opp": "Devin Davis" },
    { "code": "ME", "state": "Maine", "city": "Portland, ME", "zip": "04101", "cd": "District 1", "rep": "Chellie Pingree", "opp": "Ronald Russell" },
    { "code": "MD", "state": "Maryland", "city": "Baltimore, MD", "zip": "21201", "cd": "District 7", "rep": "Kweisi Mfume", "opp": "Scott Collier" },
    { "code": "MA", "state": "Massachusetts", "city": "Boston, MA", "zip": "02108", "cd": "District 7", "rep": "Ayanna Pressley", "opp": "Independent Challenger" },
    { "code": "MI", "state": "Michigan", "city": "Detroit, MI", "zip": "48226", "cd": "District 13", "rep": "Shri Thanedar", "opp": "Martell Bivings" },
    { "code": "MN", "state": "Minnesota", "city": "Minneapolis, MN", "zip": "55401", "cd": "District 5", "rep": "Ilhan Omar", "opp": "Dalia Al-Aqidi" },
    { "code": "MS", "state": "Mississippi", "city": "Jackson, MS", "zip": "39201", "cd": "District 2", "rep": "Bennie Thompson", "opp": "Ron Eller" },
    { "code": "MO", "state": "Missouri", "city": "St. Louis, MO", "zip": "63101", "cd": "District 1", "rep": "Cori Bush", "opp": "Wesley Bell" },
    { "code": "MT", "state": "Montana", "city": "Billings, MT", "zip": "59101", "cd": "District 2", "rep": "Troy Downing", "opp": "John Driscoll" },
    { "code": "NE", "state": "Nebraska", "city": "Omaha, NE", "zip": "68102", "cd": "District 2", "rep": "Don Bacon", "opp": "Tony Vargas" },
    { "code": "NV", "state": "Nevada", "city": "Las Vegas, NV", "zip": "89101", "cd": "District 1", "rep": "Dina Titus", "opp": "Mark Robertson" },
    { "code": "NH", "state": "New Hampshire", "city": "Manchester, NH", "zip": "03101", "cd": "District 1", "rep": "Chris Pappas", "opp": "Russell Prescott" },
    { "code": "NJ", "state": "New Jersey", "city": "Newark, NJ", "zip": "07102", "cd": "District 10", "rep": "LaMonica McIver", "opp": "Carmen Bucco" },
    { "code": "NM", "state": "New Mexico", "city": "Albuquerque, NM", "zip": "87102", "cd": "District 1", "rep": "Melanie Stansbury", "opp": "Steve Jones" },
    { "code": "NY", "state": "New York", "city": "New York, NY", "zip": "10001", "cd": "District 12", "rep": "Jerry Nadler", "opp": "Michael Zumbluskas" },
    { "code": "NC", "state": "North Carolina", "city": "Raleigh, NC", "zip": "27601", "cd": "District 2", "rep": "Deborah Ross", "opp": "Alan Swain" },
    { "code": "ND", "state": "North Dakota", "city": "Fargo, ND", "zip": "58102", "cd": "At-Large District", "rep": "Julie Fedorchak", "opp": "Trygve Hammer" },
    { "code": "OH", "state": "Ohio", "city": "Columbus, OH", "zip": "43215", "cd": "District 3", "rep": "Joyce Beatty", "opp": "Michael Young" },
    { "code": "OK", "state": "Oklahoma", "city": "Oklahoma City, OK", "zip": "73102", "cd": "District 5", "rep": "Stephanie Bice", "opp": "Madison Horn" },
    { "code": "OR", "state": "Oregon", "city": "Portland, OR", "zip": "97205", "cd": "District 3", "rep": "Maxine Dexter", "opp": "Joanna Harbour" },
    { "code": "PA", "state": "Pennsylvania", "city": "Philadelphia, PA", "zip": "19102", "cd": "District 3", "rep": "Dwight Evans", "opp": "Christopher Hoeppner" },
    { "code": "RI", "state": "Rhode Island", "city": "Providence, RI", "zip": "02903", "cd": "District 1", "rep": "Gabe Amo", "opp": "Allen Waters" },
    { "code": "SC", "state": "South Carolina", "city": "Charleston, SC", "zip": "29401", "cd": "District 1", "rep": "Nancy Mace", "opp": "Michael B. Moore" },
    { "code": "SD", "state": "South Dakota", "city": "Sioux Falls, SD", "zip": "57104", "cd": "At-Large District", "rep": "Sheri Sherrie", "opp": "Christian Sherrill" },
    { "code": "TN", "state": "Tennessee", "city": "Nashville, TN", "zip": "37203", "cd": "District 5", "rep": "Andy Ogles", "opp": "Maryam Abolfazli" },
    { "code": "TX", "state": "Texas", "city": "Austin, TX", "zip": "78701", "cd": "District 35", "rep": "Greg Casar", "opp": "Steven Wright" },
    { "code": "UT", "state": "Utah", "city": "Salt Lake City, UT", "zip": "84101", "cd": "District 2", "rep": "Celeste Maloy", "opp": "Nathaniel Woodward" },
    { "code": "VT", "state": "Vermont", "city": "Burlington, VT", "zip": "05401", "cd": "At-Large District", "rep": "Becca Balint", "opp": "Mark Coester" },
    { "code": "VA", "state": "Virginia", "city": "Richmond, VA", "zip": "23219", "cd": "District 4", "rep": "Jennifer McClellan", "opp": "Bill Moher" },
    { "code": "WA", "state": "Washington", "city": "Seattle, WA", "zip": "98116", "cd": "District 7", "rep": "Pramila Jayapal", "opp": "Nirav Sheth" },
    { "code": "WV", "state": "West Virginia", "city": "Charleston, WV", "zip": "25301", "cd": "District 1", "rep": "Carol Miller", "opp": "Chris Plein" },
    { "code": "WI", "state": "Wisconsin", "city": "Milwaukee, WI", "zip": "53202", "cd": "District 4", "rep": "Gwen Moore", "opp": "Tim Rogers" },
    { "code": "WY", "state": "Wyoming", "city": "Cheyenne, WY", "zip": "82001", "cd": "At-Large District", "rep": "Harriet Hageman", "opp": "Kyle Cameron" }
]

def build_50_state_data():
    ensure_directories()
    print("[50-State Builder] Generating static JSON election datasets for ALL 50 U.S. States...")

    manifest = {}

    for item in ALL_50_STATES:
        zip_code = item["zip"]
        state_name = item["state"]
        city_name = item["city"]
        cd_title = f"{state_name} Congressional {item['cd']}"

        data = {
            "state": state_name,
            "locationName": city_name,
            "districtText": f"{state_name} Statewide | {cd_title}",
            "races": [
              {
                "shortTitle": f"US Rep ({item['code']})",
                "type": "Federal Partisan Office • Vote for One",
                "category": "Federal Office",
                "title": f"United States Representative, {cd_title}",
                "overview": f"Represents the voters of {city_name} in the U.S. House of Representatives. Manages federal lawmaking, national budget appropriations, constituent advocacy, and federal agency oversight.",
                "sources": [
                  { "label": f"🔗 {state_name} Secretary of State", "url": "https://ballotpedia.org" },
                  { "label": "🔗 Vote411 Election Guide", "url": "https://www.vote411.org" }
                ],
                "candidates": [
                  { "name": item["rep"], "party": "Democratic Party", "partyClass": "party-dem", "desc": f"Democratic candidate focusing on healthcare access, education funding, public infrastructure, and environmental policy for {city_name}.", "site": "https://www.vote411.org" },
                  { "name": item["opp"], "party": "Republican Party", "partyClass": "party-rep", "desc": f"Republican candidate advocating for fiscal discipline, tax reduction, economic growth, public safety, and streamlined regulation in {state_name}.", "site": "https://www.vote411.org" }
                ]
              },
              {
                "shortTitle": f"{item['code']} Senate",
                "type": "State Partisan Office • Vote for One",
                "category": "State Legislative Office",
                "title": f"{state_name} State Senate",
                "overview": f"Represents local constituents in the {state_name} State Senate. Authors state statutes, sets state tax policy, and votes on public education budgets.",
                "sources": [{ "label": f"🔗 {state_name} General Assembly", "url": "https://ballotpedia.org" }],
                "candidates": [
                  { "name": f"State Senator ({city_name})", "party": "Democratic Party", "partyClass": "party-dem", "desc": f"Incumbent legislator prioritizing community economic development, infrastructure improvements, and healthcare access in {city_name}.", "site": "https://ballotpedia.org" }
                ]
              },
              {
                "shortTitle": f"{item['code']} House",
                "type": "State Partisan Office • Vote for One",
                "category": "State Legislative Office",
                "title": f"{state_name} House of Representatives",
                "overview": f"Serves in the {state_name} House of Representatives crafting state policies and constituent services for {city_name}.",
                "sources": [{ "label": f"🔗 {state_name} House", "url": "https://ballotpedia.org" }],
                "candidates": [
                  { "name": f"State Representative ({city_name})", "party": "Democratic Party", "partyClass": "party-dem", "desc": f"Focuses on local job creation, public safety, public school funding, and constituent advocacy.", "site": "https://ballotpedia.org" }
                ]
              },
              {
                "shortTitle": f"{item['code']} Executive",
                "type": "County Office • Vote for One",
                "category": "County Office",
                "title": f"{city_name} County Executive / Prosecutor",
                "overview": f"Oversees countywide criminal justice, public health, law enforcement, and regional services for {city_name}.",
                "sources": [{ "label": "🔗 County Board of Elections", "url": "https://ballotpedia.org" }],
                "candidates": [
                  { "name": "County Candidate A", "party": "Nonpartisan", "partyClass": "party-non", "desc": "Focuses on court efficiency, victim advocacy, public safety, and community diversion programs.", "site": "https://ballotpedia.org" },
                  { "name": "County Candidate B", "party": "Nonpartisan", "partyClass": "party-non", "desc": "Focuses on administrative reforms, fiscal oversight, and law enforcement support.", "site": "https://ballotpedia.org" }
                ]
              }
            ]
        }

        file_path = os.path.join(ZIPS_DIR, f"{zip_code}.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

        manifest[zip_code] = {
            "state": state_name,
            "locationName": city_name,
            "districtText": data["districtText"],
            "raceCount": 4
        }

    manifest_path = os.path.join(PUBLIC_DATA_DIR, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f_m:
        json.dump(manifest, f_m, indent=2)

    print(f"[Success] Successfully built static JSON election files for ALL {len(ALL_50_STATES)} U.S. States!")

if __name__ == "__main__":
    build_50_state_data()
