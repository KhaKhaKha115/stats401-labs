import requests
import time
import pandas as pd
from bs4 import BeautifulSoup

records = []

for page in range(1, 11):

    url = f"https://example.com/page/{page}"

    try:
        response = requests.get(
            url,
            timeout=10
        )
        response.raise_for_status()

    except requests.RequestException as error:
        print("Request failed:", error)
        continue

    soup = BeautifulSoup(
        response.text,
        "html.parser"
    )

    items = soup.select(".item")

    for item in items:

        title = item.select_one(
            ".title"
        ).get_text(strip=True)

        value = item.select_one(
            ".value"
        ).get_text(strip=True)

        records.append({
            "title": title,
            "value": value
        })

    print(
        f"Collected {len(records)} records"
    )

    time.sleep(1)

df = pd.DataFrame(records)

df.to_csv(
    "../data/scraped_data.csv",
    index=False
)