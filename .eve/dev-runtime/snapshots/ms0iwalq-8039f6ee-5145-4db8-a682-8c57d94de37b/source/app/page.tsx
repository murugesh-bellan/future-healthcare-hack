const channels = [
  ["WebApp", "Review check-ins, consent, trends and account settings."],
  ["WhatsApp", "Send a text or voice note; receive a text or audio reply."],
];

export default function HomePage() {
  return (
    <main>
      <p className="eyebrow">UNDERTONE</p>
      <h1>A listening layer between appointments.</h1>
      <p className="lede">
        A voice-first check-in companion for people managing long-term treatment.
      </p>
      <section aria-label="Available channels">
        {channels.map(([title, description]) => (
          <article key={title}>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>
      <p className="notice">
        Prototype only. Undertone does not diagnose conditions or replace clinical care.
      </p>
    </main>
  );
}
