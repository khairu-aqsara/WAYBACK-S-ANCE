from seance import check_citations, citations_in, eras, format_memories, normalize_citations, strip_invalid

REFUSAL = "I do not remember that."


def test_grouped_citations_become_single_brackets():
    assert normalize_citations("Tags were words [1, 2,6]. Plain [3].") == "Tags were words [1][2][6]. Plain [3]."


def test_eras_split_young_middle_last():
    assert [list(r) for r in eras(14)] == [[0, 1, 2], list(range(3, 11)), [11, 12, 13]]
    assert [list(r) for r in eras(4)] == [[0], [1, 2], [3]]
    assert [list(r) for r in eras(2)] == [[0], [], [1]]
    assert [list(r) for r in eras(1)] == [[0], [], []]


def test_memories_keep_global_numbers_and_skip_empty_eras():
    digests = [{"ts": "20030101000000", "text": "born"}, {"ts": "20210101000000", "text": "gone"}]
    assert format_memories(digests) == (
        "WHEN YOU WERE YOUNG\n[1] (2003-01) born\n\nYOUR LAST DAYS\n[2] (2021-01) gone"
    )


def test_valid_citations_pass():
    assert check_citations("I kept bookmarks [1]. I had tags [3].", 6)


def test_citation_past_the_passage_list_fails():
    assert not check_citations("I kept bookmarks [1]. I was sold [7].", 6)


def test_answer_without_citations_fails():
    assert not check_citations("I kept bookmarks for millions of people.", 6)


def test_refusal_line_passes_without_citations():
    assert check_citations(REFUSAL, 6)


def test_citations_in_order_without_duplicates():
    assert citations_in("a [2]. b [1]. c [2].") == [2, 1]


def test_strip_invalid_removes_only_out_of_range():
    assert strip_invalid("born [1], sold [9].", 3) == "born [1], sold ."
