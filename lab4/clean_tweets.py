import pandas as pd
import re
import nltk

from html import unescape
from pathlib import Path
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
from transformers import pipeline


# =========================================================
# SETUP
# =========================================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"

SAMPLE_PER_PERIOD = 1000
RANDOM_STATE = 42

RAW_FILES = [
    (DATA_DIR / "lab4_covid-19_twitter_dataset(Apr-Jun2020).csv", "Apr-Jun 2020"),
    (DATA_DIR / "lab4_covid-19_twitter_dataset(Aug-Sep2020).csv", "Aug-Sep 2020"),
    (DATA_DIR / "lab4_covid-19_twitter_dataset(Apr-Jun2021).csv", "Apr-Jun 2021")
]

for package in ["punkt", "punkt_tab", "stopwords", "wordnet", "omw-1.4"]:
    nltk.download(package)


# =========================================================
# TASK 1 — LOAD + INSPECT
# =========================================================

dfs = []

for file_path, period in RAW_FILES:
    df_temp = pd.read_csv(file_path, dtype={"id": "string"})
    df_temp["period"] = period

    print(f"\n===== {period} =====")
    print("Shape:", df_temp.shape)
    print(df_temp.head())

    dfs.append(df_temp)

df = pd.concat(dfs, ignore_index=True)

print("\n===== COMBINED DATA =====")
print("Shape:", df.shape)
print(df["period"].value_counts())
print(df.info())


# =========================================================
# REMOVE PRECOMPUTED KAGGLE SENTIMENT
# =========================================================

df = df[
    [
        "id", "created_at", "source", "original_text", "lang",
        "favorite_count", "retweet_count", "original_author",
        "hashtags", "user_mentions", "place", "period"
    ]
].copy()

df = df.rename(columns={
    "id": "tweet_id",
    "original_text": "tweet_text",
    "original_author": "username",
    "favorite_count": "likes",
    "retweet_count": "retweets",
    "source": "platform",
    "place": "location"
})


# =========================================================
# TASK 2 — MISSING VALUES
# =========================================================

print("\n===== MISSING VALUES =====")
print(df.isna().sum())

df = df.dropna(subset=["tweet_text", "created_at"])

df["likes"] = df["likes"].fillna(0)
df["retweets"] = df["retweets"].fillna(0)

for col in ["hashtags", "user_mentions"]:
    df[col] = df[col].fillna("")

for col in ["location", "username", "platform", "lang"]:
    df[col] = df[col].fillna("Unknown")


# =========================================================
# TASK 3 — DUPLICATES
# =========================================================
#
# IMPORTANT:
# Some 2020 tweet IDs were stored in scientific notation,
# so they cannot safely be used for duplicate detection.
#
# Instead use:
# period + created_at + username + tweet_text
# =========================================================

print("\n===== DUPLICATES =====")

duplicate_cols = ["period", "created_at", "username", "tweet_text"]

print(
    "Duplicate tweets:",
    df.duplicated(subset=duplicate_cols).sum()
)

df = df.drop_duplicates(subset=duplicate_cols, keep="first")

print("\nRows after duplicate removal:")
print(df["period"].value_counts())


# =========================================================
# TASK 4 — DATA TYPES
# =========================================================

for col in ["likes", "retweets"]:
    df[col] = df[col].astype(str).str.replace(",", "", regex=False)
    df[col] = pd.to_numeric(df[col], errors="coerce")
    df.loc[df[col] < 0, col] = pd.NA
    df[col] = df[col].fillna(0).astype(int)


# =========================================================
# TASK 5 — DATES
# =========================================================

df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce", format="mixed")
df = df.dropna(subset=["created_at"])

df["date"] = df["created_at"].dt.date
df["year"] = df["created_at"].dt.year
df["month"] = df["created_at"].dt.month
df["hour"] = df["created_at"].dt.hour
df["weekday"] = df["created_at"].dt.day_name()
df["week"] = df["created_at"].dt.to_period("W").apply(lambda x: x.start_time.date())


# =========================================================
# TASK 6 — CLEAN STRUCTURED DATA
# =========================================================

df["platform"] = (
    df["platform"]
    .astype(str)
    .str.strip()
    .apply(lambda x: re.sub(r"<[^>]+>", "", unescape(x)))
    .str.strip()
)

df["lang"] = df["lang"].astype(str).str.strip().str.lower()

df["username"] = (
    df["username"]
    .astype(str)
    .str.strip()
    .str.replace(r"^@", "", regex=True)
    .str.lower()
)

for col in ["location", "hashtags", "user_mentions"]:
    df[col] = df[col].astype(str).str.strip()

df["tweet_text"] = (
    df["tweet_text"]
    .astype(str)
    .str.replace(r"\s+", " ", regex=True)
    .str.strip()
)

df["tweet_text_raw"] = df["tweet_text"]
df = df[df["tweet_text_raw"].str.len() > 0].copy()


print("\n===== AFTER CLEANING =====")
print(df["period"].value_counts())


# =========================================================
# BALANCED SAMPLE — 1000 EACH PERIOD
# =========================================================

sampled = []

for period, group in df.groupby("period"):
    if len(group) < SAMPLE_PER_PERIOD:
        raise ValueError(f"{period} only has {len(group)} usable tweets.")

    sampled.append(
        group.sample(n=SAMPLE_PER_PERIOD, random_state=RANDOM_STATE)
    )

df = pd.concat(sampled, ignore_index=True)
df = df.sample(frac=1, random_state=RANDOM_STATE).reset_index(drop=True)

print("\n===== BALANCED SAMPLE =====")
print(df["period"].value_counts())
print("Total:", len(df))


# =========================================================
# TASK 7 — TEXT PREPROCESSING
# =========================================================

def normalize_tweet(text):
    text = text.lower()
    text = re.sub(r"https?://\S+|www\.\S+", " URL ", text)
    text = re.sub(r"@\w+", " USER ", text)
    text = re.sub(r"\b\d+(?:\.\d+)?\b", " NUMBER ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


df["text_normalized"] = df["tweet_text_raw"].apply(normalize_tweet)
df["tokens"] = df["text_normalized"].apply(word_tokenize)

stop_words = set(stopwords.words("english"))
df["tokens_no_stop"] = df["tokens"].apply(
    lambda tokens: [x for x in tokens if x not in stop_words]
)

lemmatizer = WordNetLemmatizer()
df["tokens_clean"] = df["tokens_no_stop"].apply(
    lambda tokens: [lemmatizer.lemmatize(x) for x in tokens if x.isalpha()]
)

df["text_clean"] = df["tokens_clean"].apply(" ".join)
df = df[df["text_clean"].str.len() > 0].reset_index(drop=True)

print("\n===== RAW VS CLEAN =====")
print(df[["tweet_text_raw", "text_clean"]].head())


# =========================================================
# TASK 8 + 9 — DOCUMENT TERM MATRIX
# =========================================================

vectorizer = CountVectorizer(min_df=2, max_df=0.90)
dtm = vectorizer.fit_transform(df["text_clean"])
terms = vectorizer.get_feature_names_out()

print("\n===== DOCUMENT TERM MATRIX =====")
print("Vocabulary:", len(terms))
print("DTM shape:", dtm.shape)
print(pd.DataFrame(dtm[:5].toarray(), columns=terms).iloc[:, :20])


# =========================================================
# TASK 10 — TF-IDF
# =========================================================

tfidf_vectorizer = TfidfVectorizer(min_df=2, max_df=0.90)
tfidf = tfidf_vectorizer.fit_transform(df["text_clean"])
tfidf_terms = tfidf_vectorizer.get_feature_names_out()

print("\n===== TF-IDF =====")
print("Shape:", tfidf.shape)


def top_tfidf(row):
    if row.nnz == 0:
        return ""
    i = row.data.argmax()
    return tfidf_terms[row.indices[i]]


df["top_tfidf_term"] = [top_tfidf(tfidf[i]) for i in range(tfidf.shape[0])]


# =========================================================
# TASK 11 — ROBERTA
# =========================================================

print("\n===== LOADING ROBERTA =====")

sentiment_model = pipeline(
    "sentiment-analysis",
    model="cardiffnlp/twitter-roberta-base-sentiment-latest",
    top_k=None
)


# =========================================================
# TASK 12 — SENTIMENT
# =========================================================

def prepare_for_roberta(text):
    text = re.sub(r"@\w+", "@user", str(text))
    text = re.sub(r"https?://\S+|www\.\S+", "http", text)
    return text.strip()


df["sentiment_text"] = df["tweet_text_raw"].apply(prepare_for_roberta)

print("\nRunning RoBERTa...")

results = sentiment_model(
    df["sentiment_text"].tolist(),
    truncation=True,
    batch_size=16
)


def scores_to_dict(scores):
    return {x["label"].lower(): x["score"] for x in scores}


scores = [scores_to_dict(x) for x in results]

df["sentiment_negative"] = [x.get("negative", 0) for x in scores]
df["sentiment_neutral"] = [x.get("neutral", 0) for x in scores]
df["sentiment_positive"] = [x.get("positive", 0) for x in scores]

df["sentiment"] = [
    max(x, key=x.get).capitalize()
    for x in scores
]

df["sentiment_score"] = (
    df["sentiment_positive"] - df["sentiment_negative"]
)


print("\n===== SENTIMENT BY PERIOD =====")
print(pd.crosstab(df["period"], df["sentiment"]))


# =========================================================
# TASK 13 — FINAL TIDY DATA
# =========================================================

vis_df = df[
    [
        "tweet_id", "created_at", "date", "week", "year", "month",
        "hour", "weekday", "period", "username", "platform", "lang",
        "location", "hashtags", "user_mentions", "tweet_text_raw",
        "text_clean", "top_tfidf_term", "likes", "retweets",
        "sentiment_negative", "sentiment_neutral",
        "sentiment_positive", "sentiment_score", "sentiment"
    ]
].copy()

if len(vis_df) < 1000:
    raise ValueError("Final dataset has fewer than 1000 tweets.")

vis_df.to_csv(DATA_DIR / "lab4_clean_tweets.csv", index=False)


# =========================================================
# TASK 14 — AGGREGATE DATA FOR D3
# =========================================================

sentiment_by_period = (
    vis_df.groupby(["period", "sentiment"])
    .size()
    .reset_index(name="count")
)

sentiment_by_period["proportion"] = (
    sentiment_by_period["count"]
    / sentiment_by_period.groupby("period")["count"].transform("sum")
)

sentiment_by_period.to_csv(
    DATA_DIR / "sentiment_by_period.csv",
    index=False
)


sentiment_by_week = (
    vis_df.groupby(["period", "week"])
    .agg(
        average_sentiment=("sentiment_score", "mean"),
        tweet_count=("sentiment_score", "size")
    )
    .reset_index()
)

sentiment_by_week.to_csv(
    DATA_DIR / "sentiment_by_week.csv",
    index=False
)


sentiment_counts = (
    vis_df["sentiment"]
    .value_counts()
    .rename_axis("sentiment")
    .reset_index(name="count")
)

sentiment_counts.to_csv(
    DATA_DIR / "sentiment_counts.csv",
    index=False
)


# =========================================================
# DONE
# =========================================================

print("\n===== DONE =====")
print("Final shape:", vis_df.shape)

print("\nTweets per period:")
print(vis_df["period"].value_counts())

print("\nSentiment by period:")
print(pd.crosstab(vis_df["period"], vis_df["sentiment"]))

print("\nSaved:")
print("- lab4_clean_tweets.csv")
print("- sentiment_by_period.csv")
print("- sentiment_by_week.csv")
print("- sentiment_counts.csv")