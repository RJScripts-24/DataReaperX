<div className="flex flex-wrap gap-2" style={{ marginBottom: "20px" }}>
  {COMPANIES.map(c => (
    <button
      key={c.name}
      className="hand-drawn-button"
      onClick={() => { setSelectedCompany(c.name); setReport(null); setUploadedFile(null); }}
      style={
        selectedCompany === c.name
          ? { backgroundColor: COLORS.purple, color: "#fff", borderColor: "#4a47b0" }
          : {}
      }
    >
      {c.emoji} {c.name}
    </button>
  ))}
</div>
