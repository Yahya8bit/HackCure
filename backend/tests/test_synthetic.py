from collections import Counter

from scripts.synthetic import generate


def test_generator_is_deterministic_and_has_archetypes():
    a, b = generate(), generate()
    assert [s["id"] for s in a["seizures"][:50]] == [s["id"] for s in b["seizures"][:50]]
    assert len(a["patients"]) == 150
    kinds = Counter(t["archetype"] for t in a["truth"].values())
    assert set(kinds) == {"stable", "rising", "poor_adherence", "cluster"}
    assert any(t["missing_gaps"] for t in a["truth"].values())
    assert all(t["onset_day"] is not None for t in a["truth"].values() if t["archetype"] == "rising")
