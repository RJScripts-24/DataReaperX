from datareaper.workers.jobs.run_osint_pipeline import _should_enqueue_discover_targets


def test_should_enqueue_discover_targets_on_first_cycle_with_existing_accounts() -> None:
    assert _should_enqueue_discover_targets(
        cycle_number=1,
        account_count=4,
        new_accounts=0,
        sites_found=0,
        has_existing_broker_cases=False,
    )


def test_should_not_enqueue_discover_targets_after_first_cycle_without_signal() -> None:
    assert not _should_enqueue_discover_targets(
        cycle_number=2,
        account_count=4,
        new_accounts=0,
        sites_found=0,
        has_existing_broker_cases=False,
    )


def test_should_enqueue_discover_targets_when_new_signal_exists() -> None:
    assert _should_enqueue_discover_targets(
        cycle_number=5,
        account_count=4,
        new_accounts=1,
        sites_found=0,
        has_existing_broker_cases=True,
    )
