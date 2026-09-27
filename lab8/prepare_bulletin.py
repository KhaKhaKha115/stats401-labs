#!/usr/bin/env python3
"""Prepare the DKU Undergraduate Bulletin as passage-level CSV data.

The bulletin was generated from Microsoft Word and contains a detailed PDF
outline.  PyMuPDF is used because it preserves that outline, text-block
boundaries, font information, and page coordinates while producing cleaner
text than the other parsers tested on this file.  The PDF's own outline is the
evidence for chapter/section/subsection assignments; headings are not guessed
from capitalization.

Install the two runtime dependencies if needed:

    python3 -m pip install pandas pymupdf

Paths are resolved from this script, so it may be run from any directory.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import pandas as pd

try:
    import pymupdf
except ImportError:  # PyMuPDF used the import name ``fitz`` before version 1.24.
    import fitz as pymupdf  # type: ignore[no-redef]


SCRIPT_DIR = Path(__file__).resolve().parent
PDF_PATH = SCRIPT_DIR.parent / "data" / "dku_ug_bulletin.pdf"
OUTPUT_PATH = SCRIPT_DIR / "data" / "bulletin_passages.csv"

BULLETIN_TITLE = "Bulletin of Duke Kunshan University: Undergraduate Instruction"
BULLETIN_VERSION = "2021-2022"

OUTPUT_COLUMNS = [
    "passage_id",
    "chapter",
    "section",
    "subsection",
    "page",
    "text",
    "text_clean",
    "word_count",
]

PAGE_NUMBER_RE = re.compile(r"^\s*\d{1,4}\s*$")
LIST_ITEM_RE = re.compile(
    r"^(?:[\u2022\uf0a7\u25aa\u25e6]|[a-z][.)](?=\s+[A-Z])|o(?=\s+[A-Z])|\d+[.)])\s*"
)
COURSE_TABLE_HEADER_RE = re.compile(
    r"^course\s+code\s+course\s+name\s+course\s+credit$", re.IGNORECASE
)
TERMINAL_PUNCTUATION = (".", "?", "!", ":", ";", '"', "'", "\u2019", ")")


@dataclass(frozen=True)
class HeadingEvent:
    """A formal heading taken directly from the PDF outline."""

    level: int
    title: str
    page_index: int
    y: float


@dataclass(frozen=True)
class TextSegment:
    """A paragraph-like text segment and its position on a PDF page."""

    y0: float
    y1: float
    text: str
    bold_ratio: float


@dataclass(frozen=True)
class LogicalLine:
    """Text fragments sharing one visual baseline."""

    y0: float
    y1: float
    x0: float
    text: str
    bold_characters: int
    characters: int


def compact_whitespace(value: str) -> str:
    """Collapse PDF whitespace without changing wording or punctuation."""

    return re.sub(r"\s+", " ", value).strip()


def comparison_key(value: str) -> str:
    """Return a loose key used only to match outline titles to page text."""

    return re.sub(r"[^a-z0-9]+", "", value.casefold())


def load_heading_events(
    document: Any,
) -> tuple[dict[int, list[HeadingEvent]], set[str], int]:
    """Read formal headings and their destinations from the PDF outline."""

    by_page: dict[int, list[HeadingEvent]] = defaultdict(list)
    outline_titles: set[str] = set()
    first_chapter_page = len(document)

    for level, raw_title, page_number, destination in document.get_toc(simple=False):
        title = compact_whitespace(raw_title)
        page_index = int(page_number) - 1
        point = destination.get("to") if isinstance(destination, dict) else None
        y = float(point.y) if point is not None else 0.0
        event = HeadingEvent(int(level), title, page_index, y)
        by_page[page_index].append(event)
        outline_titles.add(comparison_key(title))
        if event.level == 1:
            first_chapter_page = min(first_chapter_page, page_index)

    for events in by_page.values():
        events.sort(key=lambda event: (event.y, event.level))

    return dict(by_page), outline_titles, first_chapter_page


def join_same_baseline(lines: Iterable[LogicalLine]) -> list[LogicalLine]:
    """Combine separately encoded columns/bullets that share a baseline."""

    ordered = sorted(lines, key=lambda line: (line.y0, line.x0))
    groups: list[list[LogicalLine]] = []

    for line in ordered:
        # Separate PDF text objects in a table row can have slightly different
        # font metrics even though they share the same visual baseline.
        if groups and abs(line.y0 - groups[-1][0].y0) <= 6.0:
            groups[-1].append(line)
        else:
            groups.append([line])

    combined: list[LogicalLine] = []
    for group in groups:
        group.sort(key=lambda line: line.x0)
        parts = [line.text.strip() for line in group if line.text.strip()]
        if not parts:
            text = ""
        elif parts[0] in {"\u2022", "\uf0a7", "\u25aa", "\u25e6"}:
            text = parts[0] + " " + " ".join(parts[1:])
        else:
            text = " ".join(parts)
        combined.append(
            LogicalLine(
                y0=min(line.y0 for line in group),
                y1=max(line.y1 for line in group),
                x0=min(line.x0 for line in group),
                text=text.strip(),
                bold_characters=sum(line.bold_characters for line in group),
                characters=sum(line.characters for line in group),
            )
        )
    return combined


def page_segments(page: Any) -> list[TextSegment]:
    """Turn PDF text blocks into paragraphs and short policy/list blocks."""

    segments: list[TextSegment] = []
    page_dict = page.get_text("dict", sort=True)

    for block in page_dict.get("blocks", []):
        if "lines" not in block:
            continue

        physical_lines: list[LogicalLine] = []
        for line in block["lines"]:
            spans = line.get("spans", [])
            text = "".join(str(span.get("text", "")) for span in spans).strip()
            character_count = sum(len(str(span.get("text", "")).strip()) for span in spans)
            bold_count = sum(
                len(str(span.get("text", "")).strip())
                for span in spans
                if "bold" in str(span.get("font", "")).casefold()
            )
            x0, y0, _x1, y1 = line["bbox"]
            physical_lines.append(
                LogicalLine(
                    float(y0),
                    float(y1),
                    float(x0),
                    text,
                    bold_count,
                    character_count,
                )
            )

        logical_lines = join_same_baseline(physical_lines)
        current: list[LogicalLine] = []

        def finish_current() -> None:
            if not current:
                return
            text = "\n".join(line.text for line in current if line.text).strip()
            characters = sum(line.characters for line in current)
            if text:
                segments.append(
                    TextSegment(
                        y0=current[0].y0,
                        y1=current[-1].y1,
                        text=text,
                        bold_ratio=(
                            sum(line.bold_characters for line in current) / characters
                            if characters
                            else 0.0
                        ),
                    )
                )
            current.clear()

        for line in logical_lines:
            if not line.text:
                finish_current()
                continue

            marker = LIST_ITEM_RE.match(line.text)
            starts_list_item = bool(marker and line.text[marker.end() :].strip())
            vertical_gap = line.y0 - current[-1].y1 if current else 0.0
            paragraph_gap = bool(current) and vertical_gap > 4.0

            if current and (starts_list_item or paragraph_gap):
                finish_current()
            current.append(line)

        finish_current()

    return sorted(segments, key=lambda segment: (segment.y0, segment.y1))


def update_hierarchy(stack: list[str], event: HeadingEvent) -> None:
    """Apply an outline event while retaining the complete formal hierarchy."""

    target_index = event.level - 1
    del stack[target_index:]
    while len(stack) < target_index:
        stack.append("")
    stack.append(event.title)


def metadata_from_stack(stack: list[str]) -> tuple[str, str, str]:
    """Map an arbitrary-depth outline into the required three CSV fields.

    The bulletin outline reaches five levels in the majors tables.  Rather than
    discard those formal names, levels three and deeper are retained as a
    breadcrumb in ``subsection``.
    """

    chapter = stack[0] if stack else ""
    section = stack[1] if len(stack) > 1 else ""
    subsection = " > ".join(title for title in stack[2:] if title)
    return chapter, section, subsection


def is_formal_heading(segment: TextSegment, nearby_events: list[HeadingEvent]) -> bool:
    """Identify the printed text corresponding to an outline destination."""

    segment_key = comparison_key(segment.text)
    for event in nearby_events:
        if abs(segment.y0 - event.y) > 18.0:
            continue
        title_key = comparison_key(event.title)
        wording_matches = (
            bool(segment_key)
            and bool(title_key)
            and (segment_key in title_key or title_key in segment_key)
        )
        short_bold_heading = segment.bold_ratio >= 0.75 and len(segment.text.split()) <= 30
        if wording_matches or short_bold_heading:
            return True
    return False


def looks_like_continuation(previous: str, current: str) -> bool:
    """Decide whether the first block on a page continues the prior page."""

    previous_clean = compact_whitespace(previous)
    current_clean = compact_whitespace(current)
    if not previous_clean or not current_clean:
        return False
    if LIST_ITEM_RE.match(current_clean):
        return False
    if re.match(r"^[A-Z]{2,}\s+\d{1,3}\b", current_clean):
        return False
    if re.match(r"^(?:January|February|March|April|May|June|July|August|September|October|November|December)\b", current_clean):
        return False

    begins_lowercase = current_clean[0].islower()
    previous_is_open = not previous_clean.endswith(TERMINAL_PUNCTUATION)
    previous_is_long = len(previous_clean.split()) >= 20
    return begins_lowercase or previous_clean.endswith("-") or (previous_is_open and previous_is_long)


def extract_raw_passages(
    document: Any,
    events_by_page: dict[int, list[HeadingEvent]],
    first_chapter_page: int,
) -> list[dict[str, object]]:
    """Extract paragraph-like passages in reading order."""

    records: list[dict[str, object]] = []
    hierarchy: list[str] = []

    for page_index, page in enumerate(document):
        # The cover and the table of contents are not corpus passages.  Page 2
        # contains substantive bulletin notices, so it is retained and its
        # unavailable hierarchy is reported rather than invented.
        if page_index == 0 or 2 <= page_index < first_chapter_page:
            continue

        events = events_by_page.get(page_index, [])
        event_position = 0
        first_content_on_page = True
        heading_seen_before_content = False
        front_matter_body_started = page_index != 1

        # Footnotes at the bottom of a page follow the main text in reading
        # order, but a paragraph continuing on the next page belongs to the
        # final main-text block rather than to that footnote.
        continuation_target = next(
            (
                index
                for index in range(len(records) - 1, -1, -1)
                if records[index].get("_tail_page") == page_index
                and not (
                    float(records[index].get("_tail_y0", 0.0)) >= 675.0
                    and re.match(r"^\d+\s+", compact_whitespace(str(records[index]["text"])))
                )
            ),
            None,
        )

        for segment in page_segments(page):
            applied: list[HeadingEvent] = []
            while (
                event_position < len(events)
                and events[event_position].y <= segment.y0 + 18.0
            ):
                event = events[event_position]
                update_hierarchy(hierarchy, event)
                applied.append(event)
                event_position += 1

            nearby = applied + [
                event
                for event in events[max(0, event_position - 2) : event_position + 2]
                if abs(event.y - segment.y0) <= 18.0
            ]
            if is_formal_heading(segment, nearby):
                heading_seen_before_content = True
                continue

            text = segment.text.strip()
            if not text or PAGE_NUMBER_RE.fullmatch(text):
                continue
            if not front_matter_body_started:
                if compact_whitespace(text).startswith("The information in this bulletin applies"):
                    front_matter_body_started = True
                else:
                    continue

            chapter, section, subsection = metadata_from_stack(hierarchy)
            record = {
                "chapter": chapter,
                "section": section,
                "subsection": subsection,
                "page": page_index + 1,
                "text": text,
                "_tail_page": page_index + 1,
                "_tail_y0": segment.y0,
                "_bold_ratio": segment.bold_ratio,
            }

            target = records[continuation_target] if continuation_target is not None else None
            same_hierarchy = target is not None and all(
                target[field] == record[field]
                for field in ("chapter", "section", "subsection")
            )
            if (
                first_content_on_page
                and not heading_seen_before_content
                and same_hierarchy
                and looks_like_continuation(str(target["text"]), text)
            ):
                target["text"] = str(target["text"]).rstrip() + "\n" + text
                target["_tail_page"] = page_index + 1
                target["_tail_y0"] = segment.y0
            elif (
                records
                and records[-1].get("_tail_page") == page_index + 1
                and all(
                    records[-1][field] == record[field]
                    for field in ("chapter", "section", "subsection")
                )
                and looks_like_continuation(str(records[-1]["text"]), text)
            ):
                # Word text boxes sometimes split one paragraph or one table
                # row into adjacent blocks on the same page.
                records[-1]["text"] = str(records[-1]["text"]).rstrip() + "\n" + text
                records[-1]["_tail_y0"] = segment.y0
            else:
                records.append(record)

            first_content_on_page = False

        # Apply a rare outline destination whose heading has no extractable text
        # so that hierarchy is still correct on the following page.
        while event_position < len(events):
            update_hierarchy(hierarchy, events[event_position])
            event_position += 1

    return records


def attach_unbookmarked_labels(
    raw_records: list[dict[str, object]], outline_titles: set[str]
) -> list[dict[str, object]]:
    """Keep reliable printed labels as context without inventing hierarchy.

    A small number of bold labels (for example, ``Eligibility`` and academic
    calendar term names) are printed in the document but omitted from its PDF
    outline.  They are prepended to the following block instead of being
    classified as an unsupported subsection or left as a context-free passage.
    """

    result: list[dict[str, object]] = []
    index = 0

    while index < len(raw_records):
        current = raw_records[index]
        text = compact_whitespace(str(current["text"]))
        words = set(re.findall(r"[a-z]+", text.casefold()))
        is_table_header = words and words <= {
            "course",
            "code",
            "name",
            "credit",
            "credits",
            "requirements",
        }
        is_short_printed_label = (
            float(current.get("_bold_ratio", 0.0)) >= 0.9
            and len(text.split()) <= 10
            and not text.endswith(TERMINAL_PUNCTUATION)
            and not LIST_ITEM_RE.match(text)
            and comparison_key(text) not in outline_titles
            and not is_table_header
        )

        if is_short_printed_label and index + 1 < len(raw_records):
            following = raw_records[index + 1]
            same_location = all(
                current[field] == following[field]
                for field in ("page", "chapter", "section", "subsection")
            )
            following_is_body = float(following.get("_bold_ratio", 0.0)) < 0.8
            if same_location and following_is_body:
                merged = following.copy()
                merged["text"] = str(current["text"]).rstrip() + "\n" + str(following["text"]).lstrip()
                result.append(merged)
                index += 2
                continue

        result.append(current)
        index += 1

    return result


def repair_wrapped_table_rows(
    raw_records: list[dict[str, object]],
) -> list[dict[str, object]]:
    """Rejoin the few course-table rows split into separate PDF text boxes."""

    course_code = re.compile(r"^[A-Z]{2,}(?:[A-Z]+)?\s+\d{1,3}/?$")
    repaired: list[dict[str, object]] = []
    index = 0

    def same_location(*items: dict[str, object]) -> bool:
        return all(
            all(item[field] == items[0][field] for field in ("page", "chapter", "section", "subsection"))
            for item in items[1:]
        )

    while index < len(raw_records):
        current = raw_records[index].copy()
        current_text = compact_whitespace(str(current["text"]))

        # A cross-listed code may wrap below its course name in the first
        # column: COMPSCI 206/ + Computational Microeconomics 4 + ECON 206.
        if (
            current_text.endswith("/")
            and course_code.fullmatch(current_text)
            and index + 2 < len(raw_records)
            and same_location(current, raw_records[index + 1], raw_records[index + 2])
            and not course_code.fullmatch(compact_whitespace(str(raw_records[index + 1]["text"])))
            and course_code.fullmatch(compact_whitespace(str(raw_records[index + 2]["text"])))
        ):
            current["text"] = " ".join(
                [
                    current_text,
                    compact_whitespace(str(raw_records[index + 2]["text"])),
                    compact_whitespace(str(raw_records[index + 1]["text"])),
                ]
            )
            repaired.append(current)
            index += 3
            continue

        # A single code can wrap above the title in the neighboring text box.
        if (
            course_code.fullmatch(current_text)
            and index + 1 < len(raw_records)
            and same_location(current, raw_records[index + 1])
            and not course_code.fullmatch(compact_whitespace(str(raw_records[index + 1]["text"])))
            and len(compact_whitespace(str(raw_records[index + 1]["text"])).split()) <= 16
        ):
            current["text"] = (
                current_text + " " + compact_whitespace(str(raw_records[index + 1]["text"]))
            )
            repaired.append(current)
            index += 2
            continue

        repaired.append(current)
        index += 1

    return repaired


def is_extraction_artifact(text: str, outline_titles: set[str]) -> bool:
    """Flag known page furniture and malformed non-passages."""

    if not text or PAGE_NUMBER_RE.fullmatch(text):
        return True
    if COURSE_TABLE_HEADER_RE.fullmatch(text):
        return True
    header_words = set(re.findall(r"[a-z]+", text.casefold()))
    if header_words and len(text.split()) <= 7 and header_words <= {
        "course",
        "code",
        "name",
        "credit",
        "credits",
        "requirements",
    }:
        return True
    if re.fullmatch(r"\d+[.)]", text):
        return True
    if comparison_key(text) in outline_titles:
        return True
    if text.casefold() == "table of contents" or re.search(r"\.{5,}\s*\d+$", text):
        return True
    if not re.search(r"[A-Za-z0-9]", text):
        return True
    return False


def clean_passages(
    raw_records: list[dict[str, object]], outline_titles: set[str]
) -> pd.DataFrame:
    """Apply the tutorial cleaning steps and add passage measurements."""

    df = pd.DataFrame.from_records(raw_records)

    # Core cleaning logic from the Lab 8 tutorial.
    df = df.dropna(subset=["text"])
    df = df.drop_duplicates(subset=["text"])

    df["text_clean"] = (
        df["text"]
        .astype("string")
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
    )

    artifact_mask = df["text_clean"].map(
        lambda value: is_extraction_artifact(str(value), outline_titles)
    )
    df = df.loc[~artifact_mask].copy()
    df = df.loc[df["text_clean"].str.len() > 0].copy()
    df = df.drop_duplicates(subset=["text_clean"], keep="first")

    df["word_count"] = df["text_clean"].str.split().str.len().astype(int)
    id_width = max(4, len(str(len(df))))
    df.insert(
        0,
        "passage_id",
        [f"p{number:0{id_width}d}" for number in range(1, len(df) + 1)],
    )

    return df[OUTPUT_COLUMNS].reset_index(drop=True)


def validate_dataframe(df: pd.DataFrame, page_count: int) -> None:
    """Fail loudly if an export invariant is violated."""

    if list(df.columns) != OUTPUT_COLUMNS:
        raise ValueError(f"Unexpected columns: {list(df.columns)}")
    if not df["passage_id"].is_unique:
        raise ValueError("Passage IDs are not unique")
    if df["text_clean"].isna().any() or df["text_clean"].str.strip().eq("").any():
        raise ValueError("Empty cleaned passages remain")
    if df["text_clean"].duplicated().any():
        raise ValueError("Duplicate cleaned passages remain")
    if not df["page"].between(1, page_count).all():
        raise ValueError("One or more page numbers are outside the PDF")
    if not df["page"].is_monotonic_increasing:
        raise ValueError("Passage reading order is not monotonic by page")


def print_corpus_statistics(df: pd.DataFrame, raw_count: int) -> None:
    """Print the assignment's corpus overview and extraction diagnostics."""

    section_values = df["section"].replace("", pd.NA)

    print(f"Bulletin: {BULLETIN_TITLE} ({BULLETIN_VERSION})")
    print(f"Input PDF: {PDF_PATH}")
    print(f"Output CSV: {OUTPUT_PATH}")
    print(f"Raw passages extracted: {raw_count:,}")
    print(f"Passages after cleaning: {len(df):,}")
    print(f"Average passage length (words): {df['word_count'].mean():.2f}")
    print(f"Unique formal sections: {section_values.nunique(dropna=True):,}")

    print("\nPassage word-count summary:")
    print(df["word_count"].describe().to_string())

    print("\nPassages per section:")
    print(section_values.value_counts(dropna=False).to_string())

    print("\nMissing hierarchy metadata:")
    for column in ("chapter", "section", "subsection"):
        missing = df[column].isna() | df[column].astype("string").str.strip().eq("")
        print(f"  {column}: {int(missing.sum()):,}")


def main() -> None:
    """Extract, clean, validate, export, and summarize the bulletin corpus."""

    if not PDF_PATH.is_file():
        raise FileNotFoundError(f"Bulletin PDF not found: {PDF_PATH}")

    with pymupdf.open(PDF_PATH) as document:
        events_by_page, outline_titles, first_chapter_page = load_heading_events(document)
        raw_records = extract_raw_passages(document, events_by_page, first_chapter_page)
        raw_records = attach_unbookmarked_labels(raw_records, outline_titles)
        raw_records = repair_wrapped_table_rows(raw_records)
        df = clean_passages(raw_records, outline_titles)
        validate_dataframe(df, len(document))

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_PATH, index=False, encoding="utf-8")

    # Verify the exact artifact on disk can be loaded by Pandas.
    round_trip = pd.read_csv(OUTPUT_PATH)
    validate_dataframe(round_trip, page_count=400)
    if len(round_trip) != len(df):
        raise ValueError("CSV row count changed after round-trip loading")

    print_corpus_statistics(df, raw_count=len(raw_records))
    print("\nValidation: PASS")
    print("  Expected columns: yes")
    print("  Unique passage IDs: yes")
    print("  Empty/duplicate cleaned passages removed: yes")
    print("  Valid, monotonic page numbers: yes")
    print("  Pandas CSV round trip: yes")


if __name__ == "__main__":
    main()
