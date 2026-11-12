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
  "Contact the Grievance Officer, exercise your data rights, report content, and know how quickly we respond.",
  "/grievance-redressal",
);

export default function GrievanceRedressalPage() {
  return (
    <LegalPage
      title="Grievance Redressal"
      description="Contact the Grievance Officer, exercise your data rights, report content, and know how quickly we respond."
      version="v1.0"
      effective="2026-11-12"
      updated="2026-11-12"
      siblings={[
        { label: "Terms", href: "/terms-of-service" },
        { label: "Privacy", href: "/privacy-policy" },
        { label: "Cookies", href: "/cookies-policy" },
        { label: "Refunds", href: "/refund-policy" },
        { label: "Grievance", href: "/grievance-redressal" },
      ]}
      sections={[
        {
          id: "1-grievance-officer",
          title: "1. Grievance Officer",
          body: (
            <>
              <LegalP>
                Void-Agent has appointed a Grievance Officer. The officer
                handles grievances about personal data, complaints about
                content, and consumer complaints.
              </LegalP>
              <LegalP>
                The officer is also the person who answers questions about how
                we process your personal data (DPDP Rules, 2025, rule 9).
              </LegalP>
              <LegalTable
                headers={["Detail", "Information"]}
                rows={[
                  ["Name", "Founder & CEO, Void-Agent"],
                  ["Email", "support@void-agent.local"],
                  ["Postal address", "Void-Agent, India"],
                  [
                    "Working hours",
                    "Monday to Friday, 10:00 to 18:00 IST, except public holidays",
                  ],
                ]}
              />
              <LegalP>
                This is the single monitored mailbox for Void-Agent, so use it
                for data rights requests, grievances, content complaints and
                security reports alike. Start the subject line with the type of
                request.
              </LegalP>
              <LegalP>
                Requests are free of charge. We accept them in English. If you
                need another language, tell us and we will try to help.
              </LegalP>
            </>
          ),
        },
        {
          id: "2-your-data-rights",
          title: "2. Your Data Rights",
          body: (
            <>
              <LegalP>
                Under the Digital Personal Data Protection Act, 2023, you can:
              </LegalP>
              <LegalUl>
                <li>
                  <LegalStrong>Access:</LegalStrong> get a summary of the
                  personal data we process about you and how we process it, and
                  the names of the other Data Fiduciaries and the processors we
                  have shared it with (section 11).
                </li>
                <li>
                  <LegalStrong>Correct, complete, update or erase:</LegalStrong>{" "}
                  have your data corrected, completed or updated. Have it erased
                  when it is no longer needed, unless the law requires us to
                  keep it (section 12).
                </li>
                <li>
                  <LegalStrong>Withdraw consent:</LegalStrong> at any time. The{" "}
                  <LegalLink href="/privacy-policy">Privacy Policy</LegalLink>{" "}
                  lists the controls you can use yourself.
                </li>
                <li>
                  <LegalStrong>Raise a grievance:</LegalStrong> about anything
                  we did, or failed to do, concerning your data (section 13).
                </li>
                <li>
                  <LegalStrong>Nominate:</LegalStrong> name someone to exercise
                  your rights if you die or become unable to act (section 14).
                </li>
              </LegalUl>
            </>
          ),
        },
        {
          id: "3-how-to-make-a-request",
          title: "3. How to Make a Request",
          body: (
            <>
              <LegalP>
                Email{" "}
                <LegalLink href="mailto:support@void-agent.local">
                  support@void-agent.local
                </LegalLink>{" "}
                from the email address registered to your Void-Agent account.
              </LegalP>
              <LegalP>
                Use a subject line that starts with the type of request. For
                example: &quot;Data Access Request&quot;, &quot;Correction
                Request&quot;, &quot;Erasure Request&quot;, &quot;Account
                Deletion&quot;, &quot;Nomination&quot;, &quot;Grievance&quot; or
                &quot;Content Complaint&quot;.
              </LegalP>
              <LegalP>Include:</LegalP>
              <LegalUl>
                <li>
                  the email address of your Void-Agent account (this is the
                  identifier we use to find you)
                </li>
                <li>
                  what you want us to do, with any detail that helps, such as
                  the chat, file or record involved
                </li>
                <li>
                  for a nomination: the nominee&apos;s name, email address and
                  relationship to you
                </li>
                <li>
                  if you are acting for someone else: proof that you are
                  authorised to do so, such as a nomination, a guardianship
                  order or a power of attorney
                </li>
              </LegalUl>
              <LegalP>
                <LegalStrong>Checking identity:</LegalStrong> if a request does
                not come from the registered email address, we will ask you to
                confirm you own the account before we act. We only ask for what
                we need for that check.
              </LegalP>
            </>
          ),
        },
        {
          id: "4-response-times",
          title: "4. Response Times",
          body: (
            <>
              <LegalP>Response time depends on the type of request:</LegalP>
              <LegalTable
                headers={["Type of request", "Acknowledgement", "Resolution"]}
                rows={[
                  [
                    "Data rights requests and personal data grievances (DPDP Act and Rules)",
                    "Within 7 days",
                    "We aim for 30 days. In every case, within 90 days, the maximum allowed by DPDP Rules, rule 14(3).",
                  ],
                  [
                    "Complaints about content or conduct on the Service (IT Rules, 2021)",
                    "Within 24 hours",
                    "Within 15 days",
                  ],
                  [
                    "Requests to remove content that shows a person in a sexual act or conduct, exposes their private area, shows them partly or fully nude, or impersonates them in such material, including artificially morphed images (IT Rules, 2021, rule 3(2)(b))",
                    "Immediately",
                    "We act within 24 hours to remove the content or disable access to it",
                  ],
                  [
                    "Consumer complaints about billing, refunds or service (Consumer Protection (E-Commerce) Rules, 2020)",
                    "Within 48 hours",
                    "Within one month",
                  ],
                ]}
              />
              <LegalP>
                Every reply includes the Grievance Officer&apos;s contact
                details.
              </LegalP>
              <LegalP>
                If we cannot do what you asked, for example because the law
                requires us to keep certain records, we will tell you why.
              </LegalP>
            </>
          ),
        },
        {
          id: "5-if-you-are-not-satisfied",
          title: "5. If You Are Not Satisfied",
          body: (
            <>
              <LegalP>
                <LegalStrong>Personal data:</LegalStrong> you can complain to
                the{" "}
                <LegalLink href="https://dpb-india.gov.in">
                  Data Protection Board of India
                </LegalLink>{" "}
                using the online process it publishes. The DPDP Act (section
                13(3)) requires you to use our grievance process first.
              </LegalP>
              <LegalP>
                <LegalStrong>Consumer issues:</LegalStrong> you can contact the
                National Consumer Helpline (1915, or{" "}
                <LegalLink href="https://consumerhelpline.gov.in">
                  consumerhelpline.gov.in
                </LegalLink>
                ) or file a complaint with the consumer commission that has
                jurisdiction.
              </LegalP>
              <LegalP>
                <LegalStrong>Content decisions:</LegalStrong> you may have
                remedies under the Information Technology Act, 2000 and the
                rules made under it.
              </LegalP>
            </>
          ),
        },
        {
          id: "6-reporting-security-issues-and-breaches",
          title: "6. Reporting Security Issues and Breaches",
          body: (
            <>
              <LegalP>
                To report a suspected security vulnerability, or a breach
                involving Void-Agent, write to{" "}
                <LegalLink href="mailto:security@void-agent.local">
                  security@void-agent.local
                </LegalLink>
                .
              </LegalP>
              <LegalP>
                If a personal data breach affects you, we will notify you and
                the Data Protection Board of India, as the{" "}
                <LegalLink href="/privacy-policy">Privacy Policy</LegalLink>{" "}
                describes.
              </LegalP>
            </>
          ),
        },
        {
          id: "7-related-documents",
          title: "7. Related Documents",
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
                <LegalLink href="/refund-policy">
                  Refund &amp; Cancellation Policy
                </LegalLink>
              </li>
            </LegalUl>
          ),
        },
      ]}
    />
  );
}
