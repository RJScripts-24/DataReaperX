LEGAL_NOTICE_SUBJECT = "Data Deletion Request"
ESCALATION_SUBJECT = "Escalated Data Deletion Request"


def build_authorized_agent_header(user_full_name: str, user_email: str) -> str:
    """
    Standardized disclosure block for authorized-agent privacy requests.
    """
    normalized_name = (user_full_name or "").strip() or "Data Subject"
    normalized_email = (user_email or "").strip() or "unknown@example.com"
    return (
        "This request is submitted by an authorized privacy agent acting "
        "on behalf of the data subject identified below. The data subject "
        "has explicitly authorized this agent to submit privacy and data "
        "removal requests on their behalf.\n\n"
        "--- Data Subject Information ---\n"
        f"Full Name:     {normalized_name}\n"
        f"Email Address: {normalized_email}\n"
        "--------------------------------\n\n"
    )


def build_opt_out_email(
    broker_name: str,
    user_full_name: str,
    user_email: str,
    location: str,
    citations: str,
) -> str:
    header = build_authorized_agent_header(user_full_name, user_email)
    return (
        header
        + f"To {broker_name},\n\n"
        + "I am writing on behalf of the data subject identified above "
        + f"and located in {location}, to formally request the immediate deletion "
        + "of all personal data in your systems. This request includes all derived and "
        + "inferred data, and all data shared with affiliates or processors.\n\n"
        + "Any request for additional identity artifacts that exceeds proportional "
        + "verification is declined under data minimization principles.\n\n"
        + f"Legal basis: {citations}.\n\n"
        + "Please confirm completion in writing without undue delay."
    )

