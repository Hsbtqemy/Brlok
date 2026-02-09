# -*- coding: utf-8 -*-
"""Tests du générateur de séances."""
from brlok.generator import generate_session
from brlok.models import Block, Catalog, GridDimensions, Hold, Position


def test_generate_session_exclut_prises_inactives() -> None:
    """Les prises inactives sont exclues (FR9)."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0), active=True),
            Hold(id="B2", level=2, tags=[], position=Position(row=1, col=1), active=False),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    session = generate_session(catalog, target_level=2, blocks_count=2, seed=42)
    for block in session.blocks:
        for hold in block.holds:
            assert hold.active, f"Prise inactive incluse: {hold.id}"
            assert hold.id != "B2"


def test_generate_session_filtre_par_niveau() -> None:
    """Seules les prises au niveau cible (±1) sont utilisées."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0)),
            Hold(id="B2", level=3, tags=[], position=Position(row=1, col=1)),
            Hold(id="C3", level=5, tags=[], position=Position(row=2, col=2)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    session = generate_session(catalog, target_level=3, blocks_count=3, seed=123)
    for block in session.blocks:
        for hold in block.holds:
            assert 2 <= hold.level <= 4, f"Prise hors plage niveau: {hold.id} niv{hold.level}"
            assert hold.id != "C3"


def test_generate_session_blocs_ordonnes() -> None:
    """Les blocs sont des séquences ordonnées de prises (FR10)."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0)),
            Hold(id="B2", level=2, tags=[], position=Position(row=1, col=1)),
            Hold(id="C3", level=2, tags=[], position=Position(row=2, col=2)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    session = generate_session(catalog, target_level=2, blocks_count=2, seed=999)
    for block in session.blocks:
        assert len(block.holds) >= 1
        # L'ordre est défini (séquence)
        assert len(block.holds) == len(set(h.id for h in block.holds))


def test_generate_session_catalogue_vide() -> None:
    """Catalogue sans prises actives → session vide."""
    catalog = Catalog(holds=[], grid=GridDimensions(rows=4, cols=8))
    session = generate_session(catalog, target_level=3, blocks_count=5, seed=1)
    assert len(session.blocks) == 0
    assert session.constraints.target_level == 3


def test_generate_session_pas_assez_prises() -> None:
    """Trop peu de prises éligibles → moins de blocs."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=3, tags=[], position=Position(row=0, col=0)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    session = generate_session(
        catalog, target_level=3, blocks_count=10, holds_per_block=2, seed=1
    )
    assert len(session.blocks) >= 1
    assert session.blocks[0].holds[0].id == "A1"


def test_generate_session_contraintes_enregistrees() -> None:
    """Les contraintes sont enregistrées dans la session."""
    catalog = Catalog(
        holds=[Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0))],
        grid=GridDimensions(rows=4, cols=8),
    )
    session = generate_session(catalog, target_level=2, blocks_count=1, seed=1)
    assert session.constraints.target_level == 2


def test_generate_session_reproductible_avec_seed() -> None:
    """Même seed → même résultat."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0)),
            Hold(id="B2", level=2, tags=[], position=Position(row=1, col=1)),
            Hold(id="C3", level=2, tags=[], position=Position(row=2, col=2)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    s1 = generate_session(catalog, target_level=2, blocks_count=2, seed=42)
    s2 = generate_session(catalog, target_level=2, blocks_count=2, seed=42)
    assert len(s1.blocks) == len(s2.blocks)
    for b1, b2 in zip(s1.blocks, s2.blocks):
        assert [h.id for h in b1.holds] == [h.id for h in b2.holds]


def test_generate_session_required_tags() -> None:
    """forcer (required_tags) : seules les prises avec au moins un tag sont éligibles."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=["crimp"], position=Position(row=0, col=0)),
            Hold(id="B2", level=2, tags=["sloper"], position=Position(row=1, col=1)),
            Hold(id="C3", level=2, tags=[], position=Position(row=2, col=2)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    session = generate_session(
        catalog, target_level=2, required_tags=["crimp"], blocks_count=3, seed=1
    )
    for block in session.blocks:
        for hold in block.holds:
            assert "crimp" in hold.tags
            assert hold.id != "B2" and hold.id != "C3"
    assert session.constraints.required_tags == ["crimp"]


def test_generate_session_excluded_tags() -> None:
    """filtrer (excluded_tags) : les prises avec ces tags sont exclues."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=["crimp"], position=Position(row=0, col=0)),
            Hold(id="B2", level=2, tags=["sloper"], position=Position(row=1, col=1)),
            Hold(id="C3", level=2, tags=["crimp", "sloper"], position=Position(row=2, col=2)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    session = generate_session(
        catalog, target_level=2, excluded_tags=["sloper"], blocks_count=3, seed=1
    )
    for block in session.blocks:
        for hold in block.holds:
            assert "sloper" not in hold.tags
            assert hold.id == "A1"
    assert session.constraints.excluded_tags == ["sloper"]


def test_generate_session_required_excluded_tags_overlap() -> None:
    """Chevauchement required_tags/excluded_tags → session vide (0 blocs générés)."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=["crimp"], position=Position(row=0, col=0)),
            Hold(id="B2", level=2, tags=["sloper"], position=Position(row=1, col=1)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    session = generate_session(
        catalog,
        target_level=2,
        required_tags=["crimp"],
        excluded_tags=["crimp"],
        blocks_count=3,
        seed=1,
    )
    assert len(session.blocks) == 0
    assert session.constraints.required_tags == ["crimp"]
    assert session.constraints.excluded_tags == ["crimp"]


def test_generate_session_required_and_excluded_combined() -> None:
    """required_tags + excluded_tags combinés."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=["crimp"], position=Position(row=0, col=0)),
            Hold(id="B2", level=2, tags=["sloper"], position=Position(row=1, col=1)),
            Hold(id="C3", level=2, tags=["crimp", "pocket"], position=Position(row=2, col=2)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    session = generate_session(
        catalog,
        target_level=2,
        required_tags=["crimp"],
        excluded_tags=["pocket"],
        blocks_count=2,
        seed=1,
    )
    for block in session.blocks:
        for hold in block.holds:
            assert "crimp" in hold.tags and "pocket" not in hold.tags
            assert hold.id == "A1"


def test_generate_session_variety_evite_repetitions() -> None:
    """Avec variété, les prises sont réparties (moins de répétitions) (FR8)."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0)),
            Hold(id="B2", level=2, tags=[], position=Position(row=1, col=1)),
            Hold(id="C3", level=2, tags=[], position=Position(row=2, col=2)),
            Hold(id="D4", level=2, tags=[], position=Position(row=3, col=0)),
            Hold(id="E5", level=2, tags=[], position=Position(row=0, col=1)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    session_sans = generate_session(
        catalog, target_level=2, blocks_count=5, holds_per_block=2, variety=False, seed=42
    )
    session_avec = generate_session(
        catalog, target_level=2, blocks_count=5, holds_per_block=2, variety=True, seed=42
    )

    def count_uses(session) -> dict[str, int]:
        counts: dict[str, int] = {}
        for block in session.blocks:
            for hold in block.holds:
                counts[hold.id] = counts.get(hold.id, 0) + 1
        return counts

    max_sans = max(count_uses(session_sans).values()) if session_sans.blocks else 0
    max_avec = max(count_uses(session_avec).values()) if session_avec.blocks else 0
    # Avec variété, aucune prise ne doit dominer (max répétitions ≤ sans variété)
    assert max_avec <= max_sans or max_sans == 1
    assert session_avec.constraints.variety is True


def test_generate_session_with_favorite_blocks() -> None:
    """Les favoris sont injectés en tête de séance (FR17)."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0)),
            Hold(id="B2", level=2, tags=[], position=Position(row=1, col=1)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    fav_block = Block(holds=[
        Hold(id="C3", level=3, tags=[], position=Position(row=2, col=2)),
    ])
    session = generate_session(
        catalog, target_level=2, blocks_count=2,
        favorite_blocks=[fav_block], seed=1,
    )
    assert len(session.blocks) >= 1
    assert session.blocks[0].holds[0].id == "C3"


def test_generate_session_variety_reproductible_avec_seed() -> None:
    """Avec variety=True et seed, même résultat reproductible."""
    catalog = Catalog(
        holds=[
            Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0)),
            Hold(id="B2", level=2, tags=[], position=Position(row=1, col=1)),
            Hold(id="C3", level=2, tags=[], position=Position(row=2, col=2)),
            Hold(id="D4", level=2, tags=[], position=Position(row=3, col=0)),
            Hold(id="E5", level=2, tags=[], position=Position(row=0, col=1)),
        ],
        grid=GridDimensions(rows=4, cols=8),
    )
    s1 = generate_session(
        catalog, target_level=2, blocks_count=3, holds_per_block=2, variety=True, seed=99
    )
    s2 = generate_session(
        catalog, target_level=2, blocks_count=3, holds_per_block=2, variety=True, seed=99
    )
    assert len(s1.blocks) == len(s2.blocks)
    for b1, b2 in zip(s1.blocks, s2.blocks):
        assert [h.id for h in b1.holds] == [h.id for h in b2.holds]


def test_generate_session_variety_contrainte_enregistree() -> None:
    """La contrainte variété est enregistrée dans la session."""
    catalog = Catalog(
        holds=[Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0))],
        grid=GridDimensions(rows=4, cols=8),
    )
    session = generate_session(catalog, target_level=2, variety=True, blocks_count=1, seed=1)
    assert session.constraints.variety is True


def test_generate_session_distribution_progressive() -> None:
    """Avec distribution progressive, les prises vont du facile au difficile."""
    holds = [
        Hold(id=f"A{i}", level=1 + (i % 5), tags=[], position=Position(row=i // 6, col=i % 6))
        for i in range(12)
    ]
    catalog = Catalog(holds=holds, grid=GridDimensions(rows=4, cols=6))
    session = generate_session(
        catalog,
        target_level=3,
        blocks_count=1,
        holds_per_block=5,
        distribution_pattern="progressive",
        seed=42,
    )
    assert len(session.blocks) == 1
    block = session.blocks[0]
    levels = [h.level for h in block.holds]
    assert levels == sorted(levels), "Progressive : niveaux doivent être croissants"


def test_generate_session_per_block_levels() -> None:
    """Per_block_levels : chaque bloc utilise sa plage de niveau."""
    holds = [
        Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0)),
        Hold(id="B2", level=2, tags=[], position=Position(row=1, col=1)),
        Hold(id="C3", level=4, tags=[], position=Position(row=2, col=2)),
        Hold(id="D4", level=4, tags=[], position=Position(row=3, col=0)),
    ]
    catalog = Catalog(holds=holds, grid=GridDimensions(rows=4, cols=6))
    per_block = [(2, 1), (4, 1)]  # bloc 1: 1-3, bloc 2: 3-5
    session = generate_session(
        catalog,
        target_level=3,
        blocks_count=2,
        holds_per_block=2,
        per_block_levels=per_block,
        seed=7,
    )
    assert len(session.blocks) >= 2
    for h in session.blocks[0].holds:
        assert 1 <= h.level <= 3
    for h in session.blocks[1].holds:
        assert 3 <= h.level <= 5


def test_generate_session_performance_nfr1() -> None:
    """Génération < 5 s pour un pan typique (NFR1)."""
    import time

    # Pan typique : ~100 prises (grille 10×10)
    holds = [
        Hold(
            id=f"{chr(65 + i // 10)}{(i % 10) + 1}",
            level=2,
            tags=[],
            position=Position(row=i // 10, col=i % 10),
        )
        for i in range(100)
    ]
    catalog = Catalog(holds=holds, grid=GridDimensions(rows=10, cols=10))
    start = time.perf_counter()
    generate_session(
        catalog, target_level=2, blocks_count=10, holds_per_block=5, variety=True, seed=1
    )
    elapsed = time.perf_counter() - start
    assert elapsed < 5.0, f"Génération trop lente : {elapsed:.2f} s (NFR1: < 5 s)"
