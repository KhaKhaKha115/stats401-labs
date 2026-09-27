#!/usr/bin/env python3
"""Create the Project 2 D3 dataset from the downloaded Open Doors workbook.

The workbook is parsed with Python's standard library so this script does not
require pandas or openpyxl. Representative country coordinates and ISO codes
come from the pinned world-countries 5.1.0 dataset (ODbL-1.0).
"""

import csv
import json
import re
import unicodedata
import urllib.request
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data/individual_project2/Scholars_All-Places-of-Origin_Website.xlsx"
OUTPUT = ROOT / "data/individual_project2/scholar_origins_2024_25.csv"
COUNTRY_METADATA_URL = "https://cdn.jsdelivr.net/npm/world-countries@5.1.0/countries.json"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

NAME_ALIASES = {
    "Congo, Republic of the (Brazzaville)": "Republic of the Congo",
    "Congo, Dem. Rep. of the (Kinshasa)": "DR Congo",
    "Cabo Verde": "Cape Verde",
    "Gambia, The": "Gambia",
    "Turkey/Türkiye": "Türkiye",
    "Turks and Caicos": "Turks and Caicos Islands",
    "Palestinian Territories": "Palestine",
    "Holy See": "Vatican City",
    "Falkland Islands/Islas Malvinas": "Falkland Islands",
    "Marshall Islands, Republic of the": "Marshall Islands",
}
MAJOR_REGIONS = {
    "AFRICA, SUB-SAHARAN": "Africa",
    "ASIA": "Asia",
    "EUROPE": "Europe",
    "LATIN AMERICA & CARIBBEAN": "Americas",
    "MIDDLE EAST & NORTH AFRICA": "Asia",
    "NORTH AMERICA": "Americas",
    "OCEANIA": "Oceania",
}


def normalize(value):
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", ascii_value.lower())


def column_name(reference):
    return re.match(r"[A-Z]+", reference).group()


def load_workbook_rows(path):
    with ZipFile(path) as archive:
        shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared = [
            "".join(node.text or "" for node in item.iterfind(".//m:t", NS))
            for item in shared_root.findall("m:si", NS)
        ]
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))

    def value(cell):
        node = cell.find("m:v", NS)
        if node is None:
            return ""
        raw = node.text or ""
        return shared[int(raw)] if cell.attrib.get("t") == "s" else raw

    rows = {}
    for row in sheet.findall(".//m:sheetData/m:row", NS):
        rows[int(row.attrib["r"])] = {
            column_name(cell.attrib["r"]): value(cell) for cell in row.findall("m:c", NS)
        }
    return rows


def load_country_metadata():
    with urllib.request.urlopen(COUNTRY_METADATA_URL) as response:
        countries = json.load(response)
    index = {}
    for country in countries:
        names = [country["name"]["common"], country["name"]["official"], *country.get("altSpellings", [])]
        for name in names:
            index.setdefault(normalize(name), country)
    return index


def main():
    rows = load_workbook_rows(SOURCE)
    year_columns = [(column, year) for column, year in rows[2].items() if re.fullmatch(r"\d{4}/\d{2}", year)]
    count_column, year = year_columns[-1]
    if rows[3].get(count_column) != "Scholars":
        raise ValueError(f"Expected a Scholars column at {count_column}, found {rows[3].get(count_column)!r}")

    country_index = load_country_metadata()
    records = []
    skipped = []
    current_region = None
    for row_number in sorted(rows):
        name = rows[row_number].get("B", "").strip()
        if not name:
            continue
        if name in MAJOR_REGIONS:
            current_region = MAJOR_REGIONS[name]
            continue
        if name == "Middle East":
            current_region = "Asia"
            continue
        if name == "North Africa":
            current_region = "Africa"
            continue
        lookup_name = NAME_ALIASES.get(name, name)
        country = country_index.get(normalize(lookup_name))
        raw_count = rows[row_number].get(count_column, "").strip()
        if country is None:
            if raw_count and raw_count not in {"-", "—"}:
                skipped.append((name, raw_count))
            continue
        if current_region not in {"Africa", "Asia", "Europe", "Americas", "Oceania"}:
            raise ValueError(f"No requested region assigned to {name} on row {row_number}")
        if raw_count in {"", "-", "—"}:
            count, status = "", "missing"
        else:
            count = int(float(raw_count))
            status = "zero" if count == 0 else "positive"
        latitude, longitude = country["latlng"]
        records.append({
            "country": name,
            "country_code": country["cca3"],
            "region": current_region,
            "year": year,
            "count": count,
            "count_status": status,
            "latitude": latitude,
            "longitude": longitude,
        })

    positive = sorted((record for record in records if record["count_status"] == "positive"), key=lambda d: -d["count"])
    ranks = {record["country_code"]: rank for rank, record in enumerate(positive, 1)}
    for record in records:
        record["overall_rank"] = ranks.get(record["country_code"], "")

    fields = ["country", "country_code", "region", "year", "count", "count_status", "overall_rank", "latitude", "longitude"]
    with OUTPUT.open("w", newline="", encoding="utf-8") as output:
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        writer.writerows(records)

    print(f"Wrote {len(records)} current countries/territories to {OUTPUT.relative_to(ROOT)}")
    print(f"Positive: {len(positive)}; zero: {sum(d['count_status'] == 'zero' for d in records)}; missing: {sum(d['count_status'] == 'missing' for d in records)}")
    print(f"Latest year: {year}; largest origin: {positive[0]['country']} ({positive[0]['count']:,})")
    if skipped:
        print("Unmatched nonblank workbook rows (aggregates, historical entities, or unspecified categories):")
        for name, raw_count in skipped:
            print(f"  {name}: {raw_count}")


if __name__ == "__main__":
    main()
