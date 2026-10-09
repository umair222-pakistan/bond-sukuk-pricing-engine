import { Link } from "react-router-dom";

export default function About() {
  return (
    <div className="standard-page about-page">
      <section className="about-intro">
        <p className="eyebrow">OUR MISSION</p>
        <h1>Finance understood with clarity and purpose.</h1>
        <p className="about-lede">
          NoorFinance exists to make Islamic finance concepts easier to explore through useful, transparent educational tools.
        </p>
      </section>
      <section className="about-story">
        <div className="about-symbol" aria-hidden="true">نور</div>
        <div>
          <p className="eyebrow">WHAT GUIDES US</p>
          <h2>Clarity before complexity.</h2>
          <p>
            Financial structures can be difficult to compare. We build approachable calculators that show the assumptions,
            calculations, and cash flows behind a result, helping people ask better questions and learn at their own pace.
          </p>
          <p>
            Our tools are educational aids, not religious rulings or personalized financial recommendations. We encourage
            users to consult qualified scholars and financial professionals for decisions that affect them.
          </p>
          <Link className="catalog-link" to="/calculators">Explore our calculators <span aria-hidden="true">→</span></Link>
        </div>
      </section>
    </div>
  );
}
