import archive

DELICIOUS_2006 = (
    "del.icio.us skip to content del.icio.us popular | help login | register » keep your favorite "
    "websites, music, books, and more in a place where you can always find them. » share your "
    "favorites with family, friends, and colleagues. » discover new and interesting things by "
    "browsing popular & related items. Learn more »"
)
PETABOX_2013 = (
    "Welcome to the US Petabox US Cluster Search: All Media Types Wayback Machine Moving Images "
    "Animation & Cartoons Arts & Music Community Video Computers & Technology Cultural & Academic Films "
    "Ephemeral Films Movies News & Public Affairs Prelinger Archives Spirituality & Religion Sports Videos"
)


def test_real_homepage_text_is_kept():
    assert not archive.is_junk(DELICIOUS_2006)


def test_petabox_placeholder_is_junk_despite_length():
    assert len(PETABOX_2013) > 200
    assert archive.is_junk(PETABOX_2013)


def test_short_text_is_junk():
    assert archive.is_junk("Moved. Click here.")


def test_extract_drops_scripts_and_keeps_title_and_links():
    html = (
        "<html><head><title> My Site </title><style>p{}</style></head>"
        "<body><script>var x = 1;</script><p>Hello   there</p><a href='/about'>About</a></body></html>"
    )
    title, text, links = archive.extract(html)
    assert title == "My Site"
    assert text == "Hello there About"
    assert links == ["/about"]


def test_select_keeps_one_per_year_then_fills_from_last_and_first_year():
    rows = [(f"{y}{m:02d}01000000", "http://x.com/") for y in (2003, 2004, 2005) for m in (1, 6, 11)]
    picked = [ts[:6] for ts, _ in archive.select_snapshots(rows, max_n=5)]
    assert picked == ["200301", "200401", "200501", "200506", "200511"]


def test_select_spreads_evenly_when_years_exceed_limit():
    rows = [(f"{y}0101000000", "http://x.com/") for y in range(2000, 2030)]
    picked = [ts[:4] for ts, _ in archive.select_snapshots(rows, max_n=4)]
    assert picked[0] == "2000" and picked[-1] == "2029" and len(picked) == 4


def test_same_host_links_filters_other_hosts_assets_and_duplicates():
    hrefs = [
        "/about",
        "http://www.example.com/faq",
        "http://other.com/page",
        "mailto:a@example.com",
        "/logo.gif",
        "/about#team",
        "/",
    ]
    assert archive.same_host_links(hrefs, "http://example.com/") == [
        "http://example.com/about",
        "http://www.example.com/faq",
    ]


def test_brand_is_the_longest_label_without_tld():
    assert archive.brand("geocities.com") == "geocities"
    assert archive.brand("http://www.friendster.com/") == "friendster"
    assert archive.brand("del.icio.us") == "icio"


def test_redirect_to_new_owner_counts_as_moved():
    assert archive.landed_elsewhere(
        "http://geocities.com/", "https://www.yahoo.com/", "Yahoo | Mail, Weather, Search", "Top stories today"
    ) == "yahoo.com"


def test_redirect_that_still_names_the_site_is_kept():
    assert archive.landed_elsewhere(
        "http://geocities.com/", "http://geocities.yahoo.com/", "Yahoo! GeoCities: Get a web site", "Build it"
    ) is None


def test_same_host_page_is_kept_whatever_it_says():
    assert archive.landed_elsewhere(
        "http://del.icio.us/", "http://www.del.icio.us/", "Apache2 Ubuntu Default Page: It works", "It works"
    ) is None


def test_normalize_and_slug():
    assert archive.normalize_url("https://Del.icio.us/") == "del.icio.us"
    assert archive.normalize_url("geocities.com/Area51/Vault/") == "geocities.com/Area51/Vault"
    assert archive.slugify("http://del.icio.us") == "del-icio-us"
