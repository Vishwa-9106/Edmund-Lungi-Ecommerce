import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const FAQPage = () => {
  const faqs = [
    {
      question: "What materials are used in Edmund Lungi's products?",
      answer: "We use premium quality cotton, silk, and blended fabrics sourced from trusted suppliers. Each material is carefully selected for comfort, durability, and breathability. Our silk lungis use pure Kanchipuram silk, while our cotton range features long-staple cotton for extra softness."
    },
    {
      question: "How do I choose the right size?",
      answer: "Our lungis come in three sizes - Standard (2.0m), Long (2.2m), and Extra Long (2.5m). Standard fits most adults, Long is ideal for taller individuals, and Extra Long provides maximum coverage. If you're unsure, we recommend the Long size as it offers versatility."
    },
    {
      question: "What is your return policy?",
      answer: "We offer a 30-day return policy for unworn, unwashed items with original tags attached. Simply contact our support team with your order number, and we'll arrange a free return pickup. Refunds are processed within 5-7 business days after receiving the returned item."
    },
    {
      question: "How long does shipping take?",
      answer: "Standard shipping takes 5-7 business days across India. We also offer express shipping (2-3 days) for an additional fee. For orders above ₹1,500, standard shipping is free. International shipping is available to select countries with delivery in 10-15 business days."
    },
    {
      question: "How do I care for my lungi?",
      answer: "For cotton lungis, machine wash in cold water with mild detergent and tumble dry on low. Silk lungis should be dry cleaned or hand washed gently. Avoid bleach and direct sunlight when drying. Iron on medium heat while slightly damp for best results."
    },
    {
      question: "Do you offer bulk or wholesale orders?",
      answer: "Yes! We offer special pricing for bulk orders of 50+ units. This is perfect for events, corporate gifts, or retail partnerships. Contact our business team at wholesale@edmundlungi.com for custom quotes and exclusive designs."
    },
    {
      question: "Are your products eco-friendly?",
      answer: "Absolutely! We're committed to sustainability. Our packaging is 100% recyclable, we use natural dyes where possible, and we work with artisans who follow eco-friendly practices. We're also working towards becoming a carbon-neutral brand by 2025."
    }
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="py-16 md:py-24 bg-secondary">
        <div className="container mx-auto px-4 text-center">
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-6">
            Frequently Asked <span className="gradient-text">Questions</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Find answers to common questions about our products, shipping, returns, and more.
          </p>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4 max-w-3xl">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="bg-secondary rounded-xl px-6 border-none"
              >
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          {/* Contact CTA */}
          <div className="mt-12 text-center bg-secondary rounded-2xl p-8">
            <h2 className="font-display text-2xl font-bold mb-3">Still have questions?</h2>
            <p className="text-muted-foreground mb-6">
              Can't find what you're looking for? Our support team is here to help.
            </p>
            <Link to="/contact">
              <Button className="btn-primary">Contact Support</Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default FAQPage;
