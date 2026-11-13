import {
  LegalLink,
  LegalP,
  LegalPage,
  LegalStrong,
  LegalUl,
  legalMetadata,
} from "@/components/legal/legal-page";

export const metadata = legalMetadata(
  "Refund & Cancellation Policy",
  "How to cancel a subscription, when a refund is due, how to ask for one, and how long it takes.",
  "/refund-policy",
);

export default function RefundPolicyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Refund & Cancellation"
      accentTitle="Policy"
      description="How to cancel a subscription, when a refund is due, how to ask for one, and how long it takes."
      version="2.0"
      effective="November 1, 2026"
      siblings={[
        { label: "Terms", href: "/terms-of-service" },
        { label: "Privacy", href: "/privacy-policy" },
        { label: "Cookies", href: "/cookies-policy" },
        { label: "Refunds", href: "/refund-policy" },
        { label: "Grievance", href: "/grievance-redressal" },
      ]}
      activeSibling={3}
      sections={[
        {
          id: "purchases-billing",
          title: "Purchases & Billing",
          body: (
            <>
              <LegalP>
                Void Agent may offer paid subscriptions, one-time credit
                purchases, upgrades or add-ons, and API usage-based billing.
              </LegalP>
              <LegalP>
                All payments are processed securely through authorized payment
                providers.
              </LegalP>
            </>
          ),
        },
        {
          id: "refund-eligibility",
          title: "Refund Eligibility",
          body: (
            <>
              <LegalP>
                Refund approval is not guaranteed unless it fits the situations
                below.
              </LegalP>
              <LegalUl>
                <li>
                  <LegalStrong>Accidental or duplicate purchases:</LegalStrong>{" "}
                  You may request a refund if you purchased the same plan or
                  credits twice, or were charged more than once due to a billing
                  error.
                </li>
                <li>
                  <LegalStrong>Technical issues:</LegalStrong> Refunds may be
                  approved if the service was completely unusable, a major
                  outage prevented usage for an extended period, or you could
                  not access paid features despite support attempts.
                </li>
                <li>
                  <LegalStrong>Unauthorized transactions:</LegalStrong> If a
                  payment was made without your permission, notify us
                  immediately. Verification may be required before issuing a
                  refund.
                </li>
              </LegalUl>
            </>
          ),
        },
        {
          id: "non-refundable",
          title: "Non-Refundable Situations",
          body: (
            <>
              <LegalP>
                All digital goods are considered delivered once added to your
                account. Refunds are not provided for:
              </LegalP>
              <LegalUl>
                <li>Change of mind.</li>
                <li>Unused time on a subscription after cancellation.</li>
                <li>Remaining unused credits.</li>
                <li>Dissatisfaction with AI responses.</li>
                <li>Temporary downtime or minor issues.</li>
                <li>Misuse or violation of Terms of Service.</li>
              </LegalUl>
            </>
          ),
        },
        {
          id: "subscription-cancellations",
          title: "Subscription Cancellations",
          body: (
            <LegalP>
              You may cancel your subscription at any time. Your plan stays
              active until the end of the current billing period, no future
              payments are charged, and no partial-period refunds are issued.
            </LegalP>
          ),
        },
        {
          id: "refund-process",
          title: "Refund Request Process",
          body: (
            <>
              <LegalP>
                To request a refund, contact us with your full name, account
                email, payment method, transaction ID or receipt, and the reason
                for your request.
              </LegalP>
              <LegalP>
                We aim to review all refund requests within 7 business days.
              </LegalP>
            </>
          ),
        },
        {
          id: "chargebacks",
          title: "Chargebacks",
          body: (
            <LegalP>
              If you initiate a chargeback, your account may be suspended and
              prior usage may be reviewed for violations. We may dispute invalid
              chargebacks. Contact us first — most issues are resolved quickly.
            </LegalP>
          ),
        },
        {
          id: "policy-updates",
          title: "Policy Updates",
          body: (
            <LegalP>
              We may update this policy; changes will be posted with an updated
              effective date. See our{" "}
              <LegalLink href="/grievance-redressal">
                Grievance Redressal
              </LegalLink>{" "}
              page for escalation paths.
            </LegalP>
          ),
        },
        {
          id: "contact",
          title: "Contact Us",
          body: (
            <LegalP>
              <LegalStrong>Email:</LegalStrong>{" "}
              <LegalLink href="mailto:support@Void Agent.local">
                support@Void Agent.local
              </LegalLink>
            </LegalP>
          ),
        },
      ]}
    />
  );
}
