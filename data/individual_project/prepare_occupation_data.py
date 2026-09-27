"""Prepare the May 2025 national BLS OEWS workbook for the D3 project.

This reader uses only Python's standard library so the preprocessing step does
not require pandas or an Excel package. It reads the workbook's OOXML files,
keeps detailed occupations with valid annual medians, and writes a compact CSV.
"""

from __future__ import annotations

import csv
import math
import re
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "national_M2025_dl.xlsx"
OUTPUT = HERE / "occupation_salary_2025.csv"
SHEET_NAME = "national_M2025_dl"
EXPECTED_GROUPS = {
    "11", "13", "15", "17", "19", "21", "23", "25", "27", "29", "31",
    "33", "35", "37", "39", "41", "43", "45", "47", "49", "51", "53",
}
MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"m": MAIN_NS, "r": REL_NS}


def column_index(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference).group(0)
    index = 0
    for letter in letters:
        index = index * 26 + ord(letter) - 64
    return index - 1


def shared_strings(archive: ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return [
        "".join(node.text or "" for node in item.iter(f"{{{MAIN_NS}}}t"))
        for item in root.findall("m:si", NS)
    ]


def sheet_path(archive: ZipFile, name: str) -> str:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {
        item.attrib["Id"]: item.attrib["Target"]
        for item in relationships.findall(f"{{{PKG_REL_NS}}}Relationship")
    }
    for sheet in workbook.find("m:sheets", NS):
        if sheet.attrib["name"] == name:
            relationship_id = sheet.attrib[f"{{{REL_NS}}}id"]
            target = targets[relationship_id].lstrip("/")
            return target if target.startswith("xl/") else f"xl/{target}"
    raise ValueError(f"Worksheet {name!r} was not found")


def read_rows(path: Path, sheet_name: str) -> list[dict[str, str]]:
    with ZipFile(path) as archive:
        strings = shared_strings(archive)
        root = ET.fromstring(archive.read(sheet_path(archive, sheet_name)))
    matrix: list[list[str]] = []
    for row in root.findall(".//m:sheetData/m:row", NS):
        values: dict[int, str] = {}
        for cell in row.findall("m:c", NS):
            index = column_index(cell.attrib["r"])
            cell_type = cell.attrib.get("t")
            value_node = cell.find("m:v", NS)
            value = "" if value_node is None else value_node.text or ""
            if cell_type == "s" and value:
                value = strings[int(value)]
            elif cell_type == "inlineStr":
                value = "".join(
                    node.text or "" for node in cell.iter(f"{{{MAIN_NS}}}t")
                )
            values[index] = value.strip()
        if values:
            matrix.append([values.get(i, "") for i in range(max(values) + 1)])
    headers = matrix[0]
    return [
        {header: row[i] if i < len(row) else "" for i, header in enumerate(headers)}
        for row in matrix[1:]
    ]


def number(value: str) -> float | None:
    cleaned = value.strip().replace(",", "")
    if not cleaned or cleaned in {"*", "#", "**", "N/A", "NA"}:
        return None
    try:
        parsed = float(cleaned)
    except ValueError:
        return None
    return parsed if math.isfinite(parsed) else None


def display_number(value: float | None) -> str:
    if value is None:
        return ""
    return str(int(value)) if value.is_integer() else str(value)


def main() -> None:
    rows = read_rows(SOURCE, SHEET_NAME)
    major_titles = {
        row["OCC_CODE"][:2]: row["OCC_TITLE"]
        for row in rows
        if row.get("O_GROUP", "").lower() == "major"
        and row.get("OCC_CODE", "")[:2] in EXPECTED_GROUPS
    }
    all_occupations = next(
        (row for row in rows if row.get("OCC_CODE") == "00-0000"), None
    )
    national_median = number(all_occupations.get("A_MEDIAN", "")) if all_occupations else None

    output_rows = []
    for row in rows:
        code = row.get("OCC_CODE", "")
        group_code = code[:2]
        median = number(row.get("A_MEDIAN", ""))
        if row.get("O_GROUP", "").lower() != "detailed":
            continue
        if group_code not in EXPECTED_GROUPS or median is None:
            continue
        output_rows.append({
            "occupation_code": code,
            "occupation": row.get("OCC_TITLE", ""),
            "major_group_code": f"{group_code}-0000",
            "major_group": major_titles[group_code],
            "employment": display_number(number(row.get("TOT_EMP", ""))),
            "annual_p25": display_number(number(row.get("A_PCT25", ""))),
            "annual_median": display_number(median),
            "annual_p75": display_number(number(row.get("A_PCT75", ""))),
            "all_occupations_median": display_number(national_median),
        })

    fieldnames = list(output_rows[0])
    with OUTPUT.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(output_rows)

    represented = {row["major_group_code"][:2] for row in output_rows}
    missing = EXPECTED_GROUPS - represented
    if missing:
        raise RuntimeError(f"Missing expected occupational groups: {sorted(missing)}")
    aggregate_codes = [row["occupation_code"] for row in output_rows if row["occupation_code"].endswith("0000")]
    if aggregate_codes:
        raise RuntimeError(f"Aggregate rows were retained: {aggregate_codes[:5]}")
    print(f"Wrote {len(output_rows):,} detailed occupations to {OUTPUT}")
    print(f"Represented {len(represented)} major groups: {', '.join(sorted(represented))}")
    print(f"Official all-occupations median: ${national_median:,.0f}")


if __name__ == "__main__":
    main()
