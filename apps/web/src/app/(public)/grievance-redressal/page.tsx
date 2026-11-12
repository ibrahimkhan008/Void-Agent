import {
  LegalLink,
  LegalP,
  LegalPage,
  LegalStrong,
  LegalTable,
  LegalUl,
  legalMetadata,
} from "@/components/legal/legal-page";

export const metadata = legalMetadata(
  "Grievance Redressal & Data Rights",
  "How to file a grievance, exercise your data rights, or report a security issue.",
  "/grievance-redressal",
);

const sections = [
  {
    id: "grievance-officer",
    title: "Grievance Officer",
    body: (
      <>
        <LegalP>
          <LegalStrong>Void-Agent</LegalStrong> has designated a Grievance
          Officer to handle complaints, data rights requests, and grievances
          under applicable law.
        </LegalP>
        <LegalUl>
          <li>
            <LegalStrong>Grievance Officer:</LegalStrong> The Founder & CEO
          </li>
          <li>
            <LegalStrong>Email:</LegalStrong>{" "}
            <LegalLink href="mailto:support@void-agent.local">
              support@void-agent.local
            </LegalLink>{" "}
            (with the appropriate subject-line prefix from §3 below)
          </li>
          <li>
            <LegalStrong>Hours:</LegalStrong> Monday–Friday, 10:00–18:00 IST
          </li>
          <li>
            <LegalStrong>Postal:</LegalStrong> Void-Agent, India
          </li>
        </LegalUl>
        <LegalP>
          Requests are free of charge. We accept requests in English and will
          make a best-effort attempt to process requests in other languages.
        </LegalP>
      </>
    ),
  },
  {
    id: "your-data-rights",
    title: "Your Data Rights",
    body: (
      <>
        <LegalP>
          Depending on your jurisdiction, you may have the following rights
          regarding your personal data:
        </LegalP>
        <LegalUl>
          <li>
            <LegalStrong>Access:</LegalStrong> Request a copy of the personal
            data we hold about you.
          </li>
          <li>
            <LegalStrong>Correction:</LegalStrong> Request that we correct
            inaccurate or incomplete data.
          </li>
          <li>
            <LegalStrong>Erasure:</LegalStrong> Request deletion of your
            personal data (subject to legal retention obligations).
          </li>
          <li>
            <LegalStrong>Withdraw consent:</LegalStrong> Withdraw consent for
            processing activities that rely on it.
          </li>
          <li>
            <LegalStrong>Nominate:</LegalStrong> Nominate another individual to
            exercise your rights in the event of death or incapacity.
          </li>
          <li>
            <LegalStrong>Grievance:</LegalStrong> File a grievance about how we
            handle your data.
          </li>
        </LegalUl>
        <LegalP>
          For the full details of what we collect and why, see our{" "}
          <LegalLink href="/privacy-policy">Privacy Policy</LegalLink>.
        </LegalP>
      </>
    ),
  },
  {
    id: "how-to-make-a-request",
    title: "How to Make a Request",
    body: (
      <>
        <LegalP>
          Send an email from your registered account with one of these subject
          prefixes so we can route your request correctly:
        </LegalP>
        <LegalUl>
          <li>
            <LegalStrong>Data Access Request</LegalStrong> — for a copy of your
            data.
          </li>
          <li>
            <LegalStrong>Erasure Request</LegalStrong> — for deletion of
            specific data.
          </li>
          <li>
            <LegalStrong>Account Deletion</LegalStrong> — for full account and
            data deletion.
          </li>
          <li>
            <LegalStrong>Nomination</LegalStrong> — to nominate a
            representative.
          </li>
          <li>
            <LegalStrong>Grievance</LegalStrong> — for a complaint about data
            handling.
          </li>
          <li>
            <LegalStrong>Content Complaint</LegalStrong> — for content-related
            complaints.
          </li>
        </LegalUl>
        <LegalP>
          Please include enough detail to identify your account and the specific
          request. We may ask for verification before processing.
        </LegalP>
      </>
    ),
  },
  {
    id: "response-times",
    title: "Response Times",
    body: (
      <>
        <LegalP>
          We aim to acknowledge and resolve requests within the following
          timelines:
        </LegalP>
        <LegalTable
          headers={["Request type", "Acknowledgement", "Resolution target"]}
          rows={[
            [
              "Data rights (access, correction, erasure, nomination)",
              "Within 7 days",
              "30 days (up to 90 days for complex cases)",
            ],
            ["Content complaints", "Within 24 hours", "Within 15 days"],
            [
              "Rule 3(2)(b) removal requests",
              "Within 24 hours",
              "Within 24 hours",
            ],
            [
              "Consumer complaints (e-commerce)",
              "Within 48 hours",
              "Within 1 month",
            ],
            ["General grievances", "Within 7 days", "Within 30 days"],
          ]}
        />
      </>
    ),
  },
  {
    id: "if-you-are-not-satisfied",
    title: "If You Are Not Satisfied",
    body: (
      <>
        <LegalP>
          If you are not satisfied with our response, you may escalate:
        </LegalP>
        <LegalUl>
          <li>
            To your <LegalStrong>local data protection authority</LegalStrong>{" "}
            (in India, the Data Protection Board of India).
          </li>
          <li>
            To the <LegalStrong>National Consumer Helpline</LegalStrong> at{" "}
            <LegalStrong>1915</LegalStrong> (India).
          </li>
          <li>
            To a <LegalStrong>consumer commission</LegalStrong> (District,
            State, or National, depending on the claim amount).
          </li>
        </LegalUl>
        <LegalP>
          We ask that you complete our internal grievance process first so we
          have the opportunity to resolve the issue directly.
        </LegalP>
      </>
    ),
  },
  {
    id: "security-issues-breaches",
    title: "Security Issues & Breaches",
    body: (
      <>
        <LegalP>
          If you discover a security vulnerability or believe your data has been
          compromised, contact us immediately at{" "}
          <LegalLink href="mailto:security@void-agent.local">
            security@void-agent.local
          </LegalLink>{" "}
          with the subject prefix <LegalStrong>Security Issue</LegalStrong>.
        </LegalP>
        <LegalP>
          In the event of a personal data breach that is likely to result in a
          risk to your rights, we will notify affected users and the appropriate
          authorities within <LegalStrong>72 hours</LegalStrong> of becoming
          aware of the breach.
        </LegalP>
      </>
    ),
  },
  {
    id: "related-documents",
    title: "Related Documents",
    body: (
      <LegalUl>
        <li>
          <LegalLink href="/privacy-policy">Privacy Policy</LegalLink>
        </li>
        <li>
          <LegalLink href="/terms-of-service">Terms of Service</LegalLink>
        </li>
        <li>
          <LegalLink href="/cookies-policy">Cookies Policy</LegalLink>
        </li>
        <li>
          <LegalLink href="/refund-policy">Refund Policy</LegalLink>
        </li>
      </LegalUl>
    ),
  },
];

export default function GrievanceRedressalPage() {
  return (
    <LegalPage
      title="Grievance Redressal"
      description="How to file a grievance, exercise your data rights, or report a security issue."
      version="v1.0"
      effective="2026-11-12"
      sections={sections}
    />
  );
}
