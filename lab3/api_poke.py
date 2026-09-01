import requests
import pandas as pd
import time

url = "https://pokeapi.co/api/v2/pokemon"

records = []

for offset in range(0, 1000, 100):

    params = {
        "limit": 100,
        "offset": offset
    }

    try:
        response = requests.get(
            url,
            params=params,
            timeout=10
        )

        response.raise_for_status()

        data = response.json()

        for pokemon in data["results"]:

            pokemon_response = requests.get(
                pokemon["url"],
                timeout=10
            )

            pokemon_response.raise_for_status()

            details = pokemon_response.json()

            records.append({
                "id": details["id"],
                "name": details["name"],
                "height": details["height"],
                "weight": details["weight"],
                "base_experience": details["base_experience"],
                "type": details["types"][0]["type"]["name"]
            })

            time.sleep(0.1)

        print(
            f"Offset {offset}: {len(records)} Pokemon collected"
        )

        time.sleep(1)

    except requests.RequestException as error:

        print(
            f"Failed at offset {offset}: {error}"
        )

        continue


records = records[:1000]

df = pd.DataFrame(records)

df.to_csv(
    "../data/lab3_data.csv",
    index=False
)

print(
    f"Total records saved: {len(df)}"
)