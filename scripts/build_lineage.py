#!/usr/bin/env python3
"""Build private master data and a public, provenance-tagged lineage graph."""
from __future__ import annotations

import argparse
import csv
import difflib
import json
import re
from collections import defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = Path.home() / "Downloads"

# Screenshot cells, transcribed row-by-row. The leftmost name is newest; every
# populated cell is a little brother of the next populated cell to its right.
SCREENSHOT_ROWS = [
    ["Karl Songcuan", "Yoshi Nakachi", "Everett Lee", "John Altankhuyag", "Thomas Jiang", "Gerry Meixiong"],
    ["Ethan Kim", "Ethan Kim", "Jeewoo Choi", "Leon Bi"],
    ["William Aung", "Willy Chan", "Gerwin Mateo", "Andrew Franco", "Kevin Duan", "Daniel Classon"],
    ["Dylan Reyes", "Ryan Da", "Zachary Lin", "Alex Kwon"],
    ["Austin Lieu", "Jason Shih", "Alfred Yu", "Richard Cheung", None, "Charles Tsao"],
    ["Peter Vu", "Andrew Bui", "Ryan Da", "Zachary Lin", "Alex Kwon"],
    ["Kyle Roh", "Sunstone Shi", "Anthony Qin", "Taran Kota", "Michael Chang"],
    ["Alan Huang", "Neev Seedani", "Sean Huang", "Anton Lok"],
    ["Sid Bellam", "Zihan Wang", "Ian Song", "Terrance Yang", "Nathan Hu"],
    ["Sydney Zhang", "Khoa Trinh", "Nash Young", "David Zhou", None, "Alex Lee", "Alec Deng"],
    ["Jiashu Zhou", "Steven Wan", "Sunstone Shi", "Anthony Qin", "Taran Kota", "Michael Chang"],
    ["Bill Giang", "Luke Zhao", "Jimming He", "Minh Vu"],
    [None, "John Ou", "Nathan Tan"],
    [None, "Vincent Yip", "William Li", "Jerry Wei"],
]
# Screenshot coordinates that cannot be resolved by name alone (two Ethan Kims).
SCREENSHOT_ROSTER_OVERRIDES = {(2, 1): 309, (2, 2): 299}

ALIASES = {
    "everett lee": "everrett lee", "sid bellam": "siddharth bellam",
    "will hsu": "will hsu", "dro hsieh": "dro hsieh",
    "dave liu": "david liu", "kenny chang": "kenneth chang",
    "kevin li": "kevin q li", "mike lai": "michael lai",
    "john altankhuyag": "john t altankhuyag", "jimming he": "jimming he",
}

NODE_RE = re.compile(r"\\node\[(?P<style>bro|pledge|sensei|president|president_and_sensei)\]\s+at\s+\((?P<x>[^,]+),\s*(?P<y>[^)]+)\)\s+\((?P<key>[^)]+)\)\s*\{(?P<name>[^}]+)\}")
CLASS_RE = re.compile(r"\\node\[(?:class|pledge_class)\]\s+at\s+\(0,\s*(?P<y>[^)]+)\)\s*\{(?P<name>[^}]+)\}")
EDGE_RE = re.compile(r"\\draw\s*\((?P<parent>[^)]+)\)\s*--\s*\((?P<child>[^)]+)\)")


def clean(value: object) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip()


def normalized(value: object) -> str:
    text = clean(value).lower().replace("*", "")
    text = re.sub(r"\([^)]*\)", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    return ALIASES.get(text, text)


def parse_tex(path: Path):
    nodes, raw_edges, class_by_y = {}, [], {}
    lines = path.read_text(encoding="utf-8").splitlines()
    for line in lines:
        label = CLASS_RE.search(line)
        if label:
            class_by_y[float(label["y"])] = label["name"].replace(" PLEDGE CLASS", "").strip().casefold()
    for line in lines:
        node = NODE_RE.search(line)
        if node:
            nodes[node["key"]] = {"name": node["name"], "style": node["style"], "class_key": class_by_y.get(float(node["y"]), "")}
        edge = EDGE_RE.search(line)
        if edge:
            raw_edges.append((edge["parent"], edge["child"]))
    return nodes, raw_edges


def resolver(members: list[dict]):
    by_name = defaultdict(list)
    by_class = defaultdict(list)
    for member in members:
        by_class[member["pledge_class_key"]].append(member)
        by_name[normalized(member["full_name"])].append(member)
        # The historical sheet includes the authoritative name for roster #20,
        # whose newer spreadsheet cell was accidentally overwritten.
        if member.get("historical_name"):
            by_name[normalized(member["historical_name"])].append(member)

    def resolve(name: str, preferred_class: str | None = None, excluded_ids: set[str] | None = None):
        key = normalized(name)
        excluded_ids = excluded_ids or set()
        candidates = [candidate for candidate in {candidate["node_id"]: candidate for candidate in by_name.get(key, [])}.values() if candidate["node_id"] not in excluded_ids]
        if preferred_class:
            selected = [m for m in candidates if m["pledge_class_key"] == preferred_class]
            if len(selected) == 1:
                return selected[0], "exact_class"
        if len(candidates) == 1:
            return candidates[0], "exact"
        if len(candidates) > 1:
            return None, "ambiguous_exact"
        pool = [member for member in by_class[preferred_class] if member["node_id"] not in excluded_ids] if preferred_class else [member for member in members if member["node_id"] not in excluded_ids]
        scored = sorted(((difflib.SequenceMatcher(None, key, normalized(member["full_name"])).ratio(), member) for member in pool), reverse=True, key=lambda item: item[0])
        matches = [member for score, member in scored if score >= 0.58 and (len(scored) == 1 or score - scored[1][0] >= 0.05)]
        if len(matches) == 1:
            return matches[0], "fuzzy"
        return None, "unresolved"
    return resolve


def split_big_bros(value: str) -> list[str]:
    value = clean(value)
    if not value or value.lower() in {"nan", "none"}:
        return []
    return [part.strip() for part in re.split(r"\s*(?:\+|&|/|,|\band\b)\s*", value, flags=re.I) if part.strip()]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stanford-path", type=Path, default=DOWNLOADS / "LFE - Stanford Lambdas Database.xlsx")
    parser.add_argument("--member-path", type=Path, default=DOWNLOADS / "LFE - Member Database.xlsx")
    parser.add_argument("--tex-path", type=Path, default=DOWNLOADS / "lineage_tree_2019.tex")
    args = parser.parse_args()
    for source in (args.stanford_path, args.member_path, args.tex_path):
        if not source.exists():
            raise SystemExit(f"Missing source artifact: {source}")

    old = pd.read_excel(args.stanford_path, sheet_name="Updated Database")
    current = pd.read_excel(args.member_path, sheet_name="Sheet1")
    old = old[old["Number"].notna()].copy()
    current = current[current["Unnamed: 0"].notna()].copy()
    old["roster_number"] = old["Number"].astype(int)
    current["roster_number"] = current["Unnamed: 0"].astype(int)
    old_by_number = old.set_index("roster_number").to_dict("index")

    members = []
    class_order = []
    for _, row in current.sort_values("roster_number").iterrows():
        roster = int(row["roster_number"])
        older = old_by_number.get(roster, {})
        pledge_class = clean(row["Class"]) or clean(older.get("Class"))
        class_key = pledge_class.casefold()
        if class_key not in class_order:
            class_order.append(class_key)
        # Private data is merged for historians, but never put into public JSON.
        merged = {column: clean(value) for column, value in row.items()}
        for column, value in older.items():
            if column not in merged or not merged[column]:
                merged[column] = clean(value)
        canonical_name = clean(row["Full Name"]) or clean(older.get("ic"))
        if roster == 20:
            canonical_name = "John Chang"
        merged.update({
            "node_id": f"member-{roster}", "roster_number": roster,
            "full_name": canonical_name, "historical_name": clean(older.get("ic")),
            "pledge_class": pledge_class, "pledge_class_key": class_key,
            "status": clean(older.get("Status")), "nickname": clean(older.get("Lambda Nickname")),
            "big_bro_raw": clean(older.get("Big Bro ")),
        })
        members.append(merged)
    rank = {name: index for index, name in enumerate(class_order)}
    for member in members:
        member["class_rank"] = rank[member["pledge_class_key"]]

    private_dir, public_dir = ROOT / "data/private", ROOT / "public/data"
    private_dir.mkdir(parents=True, exist_ok=True)
    public_dir.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(members).to_csv(private_dir / "members_master.csv", index=False)

    resolve = resolver(members)
    tex_nodes, tex_raw_edges = parse_tex(args.tex_path)
    tex_node_ids, unresolved = {}, []
    # Four Epsilon labels are nicknames rather than legal names. These verified
    # roster mappings prevent a fuzzy match from swapping them.
    tex_overrides = {
        "e_dh": 57, "e_ah": 58, "e_wh": 59, "e_wl": 61,
        # Historical nickname labels confirmed against the alumni workbook.
        "p_kk": 136, "f_tj": 183,
    }
    members_by_roster = {member["roster_number"]: member for member in members}
    tex_assigned = set()
    for key, node in tex_nodes.items():
        matched, method = (members_by_roster[tex_overrides[key]], "verified_override") if key in tex_overrides else resolve(node["name"], node["class_key"], tex_assigned)
        if matched:
            tex_node_ids[key] = matched["node_id"]
            tex_assigned.add(matched["node_id"])
            matched["roles"] = sorted(set(matched.get("roles", []) + {
                "president": ["president", "president_and_sensei"],
                "sensei": ["sensei", "president_and_sensei"],
            }.get(node["style"], [])))
        else:
            unresolved.append({"source": "tex_node", "name": node["name"], "reason": method})

    edges, edge_keys = [], set()
    def add_edge(parent, child, source, note=""):
        if not parent or not child or parent == child:
            return
        key = (parent, child)
        if key in edge_keys:
            return
        edge_keys.add(key)
        edges.append({"big_bro_id": parent, "little_bro_id": child, "source": source, "note": note})

    for parent_key, child_key in tex_raw_edges:
        if parent_key in tex_node_ids and child_key in tex_node_ids:
            add_edge(tex_node_ids[parent_key], tex_node_ids[child_key], "tex")
        else:
            unresolved.append({"source": "tex_edge", "name": f"{parent_key} -> {child_key}", "reason": "unresolved endpoint"})

    by_id = {member["node_id"]: member for member in members}
    # The historical Big Bro column is retained in the private master CSV for
    # reconciliation. The TikZ diagram is the authoritative 2019 edge source;
    # avoiding a second inferred edge set keeps public graph links verifiable.

    for row_number, row in enumerate(SCREENSHOT_ROWS, start=1):
        resolved_row = []
        for column_number, name in enumerate(row, start=1):
            if not name:
                continue
            override = SCREENSHOT_ROSTER_OVERRIDES.get((row_number, column_number))
            member, method = (members_by_roster[override], "verified_override") if override else resolve(name)
            if member:
                resolved_row.append(member)
            else:
                unresolved.append({"source": "screenshot", "name": name, "row": row_number, "reason": method})
        for little, big in zip(resolved_row, resolved_row[1:]):
            if big["class_rank"] < little["class_rank"]:
                add_edge(big["node_id"], little["node_id"], "screenshot_2026", f"screenshot row {row_number}")
            else:
                unresolved.append({"source": "screenshot", "row": row_number, "name": f"{big['full_name']} -> {little['full_name']}", "reason": "non-chronological"})

    public_members = [{
        "id": member["node_id"], "roster_number": member["roster_number"],
        "name": member["full_name"], "pledge_class": member["pledge_class"],
        "class_rank": member["class_rank"], "roles": member.get("roles", []),
        "status": member["status"], "nickname": member["nickname"],
    } for member in members]
    public_members.sort(key=lambda member: member["roster_number"])
    (public_dir / "members.json").write_text(json.dumps(public_members, indent=2) + "\n")
    (public_dir / "lineage_edges.json").write_text(json.dumps(edges, indent=2) + "\n")

    linked_children = {edge["little_bro_id"] for edge in edges}
    post_2019 = [member for member in members if member["roster_number"] >= 264]
    missing = [member for member in post_2019 if member["node_id"] not in linked_children]
    counts = defaultdict(int)
    for edge in edges:
        counts[edge["source"]] += 1
    report = [
        "# Lineage audit", "", f"- Members: **{len(members)}**", f"- Edges: **{len(edges)}**", f"- Edges by source: " + ", ".join(f"{source}={count}" for source, count in sorted(counts.items())),
        f"- Unresolved source references: **{len(unresolved)}**", "",
        "## Post-2019 members without a recorded Big Bro edge", "",
        "These are expected historian follow-ups; absent edges are not inferred.", "",
        "| Roster | Name | Pledge class |", "| ---: | --- | --- |",
    ]
    report += [f"| {member['roster_number']} | {member['full_name']} | {member['pledge_class']} |" for member in missing]
    report += ["", "## Unresolved references", "", "| Source | Reference | Reason |", "| --- | --- | --- |"]
    report += [f"| {item['source']} | {item.get('name', '')} | {item['reason']} |" for item in unresolved]
    (ROOT / "LINEAGE_AUDIT.md").write_text("\n".join(report) + "\n")
    print(f"Built {len(public_members)} members and {len(edges)} lineage edges.")
    print(f"Follow-ups: {len(missing)} post-2019 members have no incoming lineage edge.")


if __name__ == "__main__":
    main()
