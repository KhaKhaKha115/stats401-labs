import requests
from bs4 import BeautifulSoup
import pandas as pd
import requests
import time
from urllib.robotparser import RobotFileParser

rp = RobotFileParser()
rp.set_url("https://example.com/robots.txt")
rp.read()

allowed = rp.can_fetch(
    "STATS401-Class-Exercise/1.0",
    "https://example.com/some-page"
)

print("Allowed:", allowed)

url = "https://jsonplaceholder.typicode.com/posts"

response = requests.get(url, timeout=10)
response.raise_for_status()

data = response.json()

records = []

for post in data:

    records.append({
        "id": post["id"],
        "user_id": post["userId"],
        "title": post["title"]
    })

df = pd.DataFrame(records)

df.to_csv(
    "../data/posts.csv",
    index=False
)

for page in range(1, 11):

    params = {
        "page": page,
        "limit": 100
    }

    response = requests.get(
        "https://api.example.com/items",
        params=params,
        timeout=10
    )

    response.raise_for_status()

    page_data = response.json()

    records.extend(page_data)

    if len(records) >= 1000:
        break

    time.sleep(1)

records = records[:1000]