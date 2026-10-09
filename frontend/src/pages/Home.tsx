import { Link } from "react-router-dom";

const features = [
  {
    number: "01",
    title: "Shariah Compliant",
    description: "Explore calculations grounded in Islamic finance structures and principles.",
  },
  {
    number: "02",
    title: "Transparent Formulas",
    description: "Understand the inputs, formulas, and cash flows behind every result.",
  },
  {
    number: "03",
    title: "Export Ready",
    description: "Keep a copy of your cash-flow schedules for review and planning.",
  },
];

export default function Home() {
  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">FINANCE, WITH PURPOSE</p>
          <h1>Make every financial decision more <em>considered.</em></h1>
          <p className="hero-lede">
            Practical, transparent tools for understanding Islamic finance — from sukuk pricing to the cash flows behind it.
          </p>
          <div className="hero-actions">
            <Link className="button-primary" to="/calculators">Start Calculating <span aria-hidden="true">→</span></Link>
            <Link className="button-secondary" to="/about">Our mission</Link>
          </div>
          <p className="hero-footnote">Clear inputs. Transparent outputs. Your calculations stay in your browser.</p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="hero-emblem"><span>نور</span><i /></div>
          <div className="hero-tag tag-top">Built for clarity</div>
          <div className="hero-tag tag-bottom">Ethical finance tools</div>
        </div>
      </section>

      <section className="content-section features-section">
        <div className="section-intro">
          <p className="eyebrow">A BETTER WAY TO EXPLORE</p>
          <h2>Tools that put understanding first.</h2>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.number}>
              <span className="feature-number">{feature.number}</span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="how-section">
        <div>
          <p className="eyebrow">HOW IT WORKS</p>
          <h2>From question to clearer picture.</h2>
        </div>
        <ol className="steps-list">
          <li><span>1</span><div><h3>Choose a calculator</h3><p>Start with the finance structure or question you want to explore.</p></div></li>
          <li><span>2</span><div><h3>Enter your assumptions</h3><p>Set the terms that matter, from principal and rate to payment frequency.</p></div></li>
          <li><span>3</span><div><h3>Review the detail</h3><p>Compare results, inspect cash flows, and save a copy of your schedule.</p></div></li>
        </ol>
      </section>

      <section className="home-cta">
        <p className="eyebrow">TAKE THE NEXT STEP</p>
        <h2>Start with a clearer understanding.</h2>
        <p>Explore the tools and see how each calculation comes together.</p>
        <Link className="button-light" to="/calculators">Start Calculating <span aria-hidden="true">→</span></Link>
      </section>
    </div>
  );
}
