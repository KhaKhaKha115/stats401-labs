"""Generate semantic-analysis datasets for the Lab 8 visualizations.

This script reads the already-prepared passage CSV; it never modifies that file.
Run it from the repository root with a Python environment containing pandas,
sentence-transformers, umap-learn, and scikit-learn.
"""

from pathlib import Path

import numpy as np
import pandas as pd
import umap
from sentence_transformers import SentenceTransformer
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.neighbors import NearestNeighbors


LAB_DIR = Path(__file__).resolve().parent
DATA_DIR = LAB_DIR / "data"
INPUT_PATH = DATA_DIR / "bulletin_passages.csv"
MAP_PATH = DATA_DIR / "lab8_embedding_map.csv"
MATRIX_PATH = DATA_DIR / "lab8_topic_section_matrix.csv"
NEIGHBOR_PATH = DATA_DIR / "lab8_nearest_neighbors.csv"

MODEL_NAME = "all-MiniLM-L6-v2"
N_CLUSTERS = 8
RANDOM_STATE = 401
UNSECTIONED_LABEL = "Chapter Introduction / Front Matter"

# Labels assigned after inspecting the printed TF-IDF terms and the five
# passages nearest each cluster centroid (see print_cluster_evidence()).
TOPIC_LABELS = {
    0: "China and Asian Studies",
    1: "Politics, Society and Global Studies",
    2: "Prerequisites and Course Sequences",
    3: "Media, Arts and Literature",
    4: "Research and Interdisciplinary Study",
    5: "DKU Degrees and Transfer Credit",
    6: "STEM and Quantitative Courses",
    7: "Academic Policies, Grades and Credits",
}


def load_passages() -> pd.DataFrame:
    """Load and validate the completed corpus without changing the source file."""
    df = pd.read_csv(INPUT_PATH, keep_default_na=False)
    required = {
        "passage_id", "chapter", "section", "subsection", "page",
        "text", "text_clean", "word_count",
    }
    missing = sorted(required.difference(df.columns))
    if missing:
        raise ValueError(f"Missing required passage columns: {', '.join(missing)}")
    if df["passage_id"].duplicated().any():
        raise ValueError("passage_id values must be unique")
    if (df["text_clean"].str.strip() == "").any():
        raise ValueError("Every passage must have non-empty text_clean")

    df["page"] = pd.to_numeric(df["page"], errors="raise").astype(int)
    df["word_count"] = pd.to_numeric(df["word_count"], errors="raise").astype(int)
    # Some passages have no section heading. A single explicit fallback keeps
    # every passage visible without miscounting chapter names as formal sections.
    df["section"] = df["section"].where(
        df["section"].str.strip() != "", UNSECTIONED_LABEL
    )
    return df


def print_cluster_evidence(df: pd.DataFrame, embeddings: np.ndarray, centers: np.ndarray) -> None:
    """Print characteristic terms and centroid-nearest passages for label review."""
    vectorizer = TfidfVectorizer(
        stop_words="english", min_df=3, max_df=0.92, ngram_range=(1, 2), max_features=12000
    )
    matrix = vectorizer.fit_transform(df["text_clean"])
    terms = np.asarray(vectorizer.get_feature_names_out())

    for cluster in range(N_CLUSTERS):
        indices = np.flatnonzero(df["cluster"].to_numpy() == cluster)
        mean_tfidf = np.asarray(matrix[indices].mean(axis=0)).ravel()
        top_terms = terms[np.argsort(mean_tfidf)[-12:][::-1]]
        similarities = embeddings[indices] @ centers[cluster]
        representative_indices = indices[np.argsort(similarities)[-5:][::-1]]
        print(f"\nCLUSTER {cluster} ({len(indices)} passages)")
        print("TF-IDF:", ", ".join(top_terms))
        for idx in representative_indices:
            row = df.iloc[idx]
            excerpt = " ".join(row["text_clean"].split())[:260]
            print(f"- {row['passage_id']} | {row['section']} | p. {row['page']} | {excerpt}")


def generate() -> None:
    df = load_passages()
    model = SentenceTransformer(MODEL_NAME)
    embeddings = model.encode(
        df["text_clean"].tolist(),
        normalize_embeddings=True,
        show_progress_bar=True,
    )

    kmeans = KMeans(n_clusters=N_CLUSTERS, random_state=RANDOM_STATE, n_init="auto")
    df["cluster"] = kmeans.fit_predict(embeddings)
    print_cluster_evidence(df, embeddings, kmeans.cluster_centers_)
    df["cluster_name"] = df["cluster"].map(TOPIC_LABELS)

    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=15,
        min_dist=0.15,
        metric="cosine",
        random_state=RANDOM_STATE,
    )
    coordinates = reducer.fit_transform(embeddings)
    df["x"] = coordinates[:, 0]
    df["y"] = coordinates[:, 1]

    map_columns = [
        "passage_id", "chapter", "section", "subsection", "page", "text",
        "word_count", "cluster", "cluster_name", "x", "y",
    ]
    df[map_columns].to_csv(MAP_PATH, index=False)

    sections = sorted(df["section"].unique(), key=str.casefold)
    topics = [TOPIC_LABELS[c] for c in sorted(TOPIC_LABELS)]
    complete_index = pd.MultiIndex.from_product(
        [sections, topics], names=["section", "cluster_name"]
    )
    matrix = (
        df.groupby(["section", "cluster_name"], observed=True)
        .size()
        .reindex(complete_index, fill_value=0)
        .rename("count")
        .reset_index()
    )
    section_totals = df.groupby("section").size()
    matrix["section_total"] = matrix["section"].map(section_totals)
    matrix["proportion"] = matrix["count"] / matrix["section_total"]
    matrix.to_csv(MATRIX_PATH, index=False)

    # NearestNeighbors avoids materializing a 2,134 × 2,134 similarity matrix.
    nearest = NearestNeighbors(n_neighbors=6, metric="cosine", algorithm="brute")
    nearest.fit(embeddings)
    distances, indices = nearest.kneighbors(embeddings)
    neighbor_rows = []
    passage_ids = df["passage_id"].to_numpy()
    for source_index, (row_distances, row_indices) in enumerate(zip(distances, indices)):
        candidates = [
            (neighbor_index, distance)
            for neighbor_index, distance in zip(row_indices, row_distances)
            if neighbor_index != source_index
        ][:5]
        for rank, (neighbor_index, distance) in enumerate(candidates, start=1):
            neighbor_rows.append({
                "passage_id": passage_ids[source_index],
                "neighbor_id": passage_ids[neighbor_index],
                "rank": rank,
                "similarity": 1.0 - float(distance),
            })
    pd.DataFrame(neighbor_rows).to_csv(NEIGHBOR_PATH, index=False)

    print(f"\nWrote {len(df):,} passages to {MAP_PATH}")
    print(f"Wrote {len(matrix):,} complete matrix cells to {MATRIX_PATH}")
    print(f"Wrote {len(neighbor_rows):,} neighbor relationships to {NEIGHBOR_PATH}")


if __name__ == "__main__":
    generate()
