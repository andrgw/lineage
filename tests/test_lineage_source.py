import copy
import json
import unittest
from pathlib import Path

from scripts.prepare_viewer import build_graph


FIRST = "7a71d737-cfb8-4225-bdf9-b9a98e790ef1"
SECOND = "77319fa7-16cc-4a8d-b97c-1fe58f0434e5"


def sample_source():
    return {
        "schema_version": 1,
        "chapters": ["Founding", "Alpha"],
        "members": [
            {"id": FIRST, "name": "Big Brother", "chapter": "Founding", "roles": ["president"], "layout_x": 1.0},
            {"id": SECOND, "name": "Little Brother", "chapter": "Alpha", "roles": ["sensei"], "layout_x": 2.0},
        ],
        "edges": [{"source": FIRST, "target": SECOND}],
    }


class LineageSourceTests(unittest.TestCase):
    def test_canonical_source_is_sanitized_and_builds_viewer_data(self):
        source = json.loads(Path("source/lineage.json").read_text(encoding="utf-8"))
        graph = build_graph(source)
        self.assertEqual(len(source["members"]), 317)
        self.assertEqual(len(source["edges"]), 290)
        self.assertEqual(set(source), {"schema_version", "chapters", "members", "edges"})
        self.assertTrue(all(set(member) == {"id", "name", "chapter", "roles", "layout_x"} for member in source["members"]))
        self.assertEqual(len(graph["nodes"]), len(source["members"]))
        self.assertEqual(len(graph["edges"]), len(source["edges"]))
        self.assertEqual(set(graph["nodes"][0]), {"id", "display_name", "class_name", "rank", "x", "roles"})

    def test_rejects_private_or_unknown_fields(self):
        for field in ("roster_number", "email", "phone", "location", "company"):
            source = sample_source()
            source["members"][0][field] = "must not be published"
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "only id, name, chapter, roles, and layout_x"):
                build_graph(source)

    def test_rejects_bad_ids_edges_roles_and_chapter_order(self):
        mutations = [
            (lambda s: s["members"].append(copy.deepcopy(s["members"][0])), "unique"),
            (lambda s: s["edges"].append({"source": FIRST, "target": "00000000-0000-4000-8000-000000000000"}), "unknown member"),
            (lambda s: s["edges"].append({"source": FIRST, "target": SECOND}), "Duplicate"),
            (lambda s: s["edges"].__setitem__(0, {"source": SECOND, "target": FIRST}), "earlier to a later chapter"),
            (lambda s: s["edges"].__setitem__(0, {"source": FIRST, "target": FIRST}), "own Big Bro"),
            (lambda s: s["members"][0].__setitem__("roles", ["administrator"]), "president/sensei"),
            (lambda s: s["members"][0].__setitem__("id", "not-a-uuid"), "UUIDs"),
        ]
        for mutate, message in mutations:
            source = sample_source()
            mutate(source)
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                build_graph(source)

    def test_allows_multiple_big_bros_and_rejects_duplicate_chapters(self):
        source = sample_source()
        source["members"].append({"id": "ecedce32-43a9-451d-a629-4c6c7cf719be", "name": "Second Big", "chapter": "Founding", "roles": [], "layout_x": 3.0})
        source["edges"].append({"source": "ecedce32-43a9-451d-a629-4c6c7cf719be", "target": SECOND})
        self.assertEqual(len(build_graph(source)["edges"]), 2)
        source["chapters"].append("Founding")
        with self.assertRaisesRegex(ValueError, "unique"):
            build_graph(source)


if __name__ == "__main__":
    unittest.main()
