"""Offline regression checks for the Todo card source."""
import importlib.machinery
import importlib.util
import pathlib
import tempfile
import unittest

loader = importlib.machinery.SourceFileLoader("todo", str(pathlib.Path(__file__).parents[1] / "bin/cardfile-todo"))
spec = importlib.util.spec_from_loader(loader.name, loader)
assert spec is not None
todo = importlib.util.module_from_spec(spec)
loader.exec_module(todo)


class TodoTests(unittest.TestCase):
    def test_full_item_and_work_links(self):
        with tempfile.TemporaryDirectory() as folder:
            path = pathlib.Path(folder) / "TODO.md"
            path.write_text("""## P3: Essential
- [ ] A very long parent title [context: medium]
  - [x] Completed
  - [ ] [Child work](work/child/README.md)
    - [ ] Nested step
  - Evidence: supporting note

- [x] Not shown
  - [ ] Not attached
- [ ] [Parent work](work/parent/README.md)
## P4: Low
- [ ] Another item
""")
            cards = [todo.card(item, "TODO.md") for item in todo.parse(str(path))]
            self.assertEqual(len(cards), 3)
            card = cards[0]
            self.assertEqual(card["progress"], [1, 3])
            self.assertIn("  - [x] Completed", card["markdown"])
            self.assertIn("    - [ ] Nested step", card["markdown"])
            self.assertIn("Evidence: supporting note", card["markdown"])
            self.assertNotIn("Not shown", card["markdown"])
            self.assertEqual(card["index"], str(path))
            self.assertEqual(card["links"][0]["file"], str(path.parent / "work/child/README.md"))
            self.assertEqual(cards[1]["file"], str(path.parent / "work/parent/README.md"))

    def test_empty_and_checked_items(self):
        with tempfile.TemporaryDirectory() as folder:
            path = pathlib.Path(folder) / "TODO.md"
            path.write_text("## P1: Rush\n- [x] Done\n")
            self.assertEqual(todo.parse(str(path)), [])


if __name__ == "__main__":
    unittest.main()
