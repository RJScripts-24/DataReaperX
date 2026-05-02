class DataReaperError(Exception):
    """Base application error."""


class ResourceNotFoundError(DataReaperError):
    """Raised when a resource cannot be located."""


class InvalidSeedError(DataReaperError):
    """Raised when a seed value is invalid."""


class LLMProviderError(DataReaperError):
    """Raised when an upstream LLM provider call fails."""


class LLMRateLimitError(LLMProviderError):
    """Raised when an upstream LLM provider is rate limited."""
