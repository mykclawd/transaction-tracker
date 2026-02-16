"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Upload, Brain, PieChart, Smartphone, Zap, Shield } from "lucide-react";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-zinc-950 dark:to-zinc-900 overflow-x-hidden">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-8 items-center">
            {/* Left: Text */}
            <div className="text-center lg:text-left">
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-5xl lg:text-6xl">
                Track expenses with{" "}
                <span className="text-blue-600">AI magic</span>
              </h1>
              <p className="mt-6 text-lg text-zinc-600 dark:text-zinc-400 max-w-xl mx-auto lg:mx-0">
                Just record your credit card app, and our AI extracts every transaction automatically. 
                No more manual entry. No more spreadsheets.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link href="/sign-up">
                  <Button size="lg" className="w-full sm:w-auto text-lg px-8 py-6">
                    Get Started Free
                  </Button>
                </Link>
                <Link href="/sign-in">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto text-lg px-8 py-6">
                    Sign In
                  </Button>
                </Link>
              </div>
              <p className="mt-4 text-sm text-zinc-500">
                No credit card required • Free forever
              </p>
            </div>
            
            {/* Right: Hero Image */}
            <div className="relative px-4 sm:px-0">
              <div className="relative mx-auto max-w-xs sm:max-w-md lg:max-w-none">
                <img
                  src="/hero.jpg"
                  alt="Spend app showing transaction tracking"
                  className="rounded-3xl shadow-2xl w-full"
                />
                {/* Floating elements */}
                <div className="absolute -top-2 right-0 sm:-top-4 sm:-right-4 bg-green-500 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-semibold shadow-lg">
                  ✨ AI-Powered
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-white dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-zinc-900 dark:text-white">
              How it works
            </h2>
            <p className="mt-4 text-zinc-600 dark:text-zinc-400">
              Three simple steps to financial clarity
            </p>
          </div>
          
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                icon: Smartphone,
                title: "1. Record your screen",
                description: "Open your credit card app and scroll through your transactions while recording.",
              },
              {
                icon: Brain,
                title: "2. AI extracts data",
                description: "Our AI analyzes the video and extracts every transaction—merchant, date, amount, and rewards.",
              },
              {
                icon: PieChart,
                title: "3. See your insights",
                description: "Get beautiful charts, category breakdowns, and monthly spending analysis instantly.",
              },
            ].map((step, i) => (
              <Card key={i} className="relative overflow-hidden border-0 shadow-lg">
                <CardContent className="pt-8 pb-6 px-6 text-center">
                  <div className="mx-auto w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mb-4">
                    <step.icon className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">
                    {step.title}
                  </h3>
                  <p className="text-zinc-600 dark:text-zinc-400">
                    {step.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div className="order-2 lg:order-1">
              <img
                src="/app-icon-nobg3.png"
                alt="Spend features"
                className="w-full max-w-xs sm:max-w-sm mx-auto"
              />
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-white mb-8 text-center lg:text-left">
                Everything you need to track spending
              </h2>
              <div className="space-y-6">
                {[
                  {
                    icon: Zap,
                    title: "Instant extraction",
                    description: "Upload a video and get transactions in seconds, not hours.",
                  },
                  {
                    icon: PieChart,
                    title: "Smart categorization",
                    description: "AI automatically categorizes merchants. Customize to your preference.",
                  },
                  {
                    icon: Upload,
                    title: "Multiple uploads",
                    description: "Upload as many videos as you want. We dedupe automatically.",
                  },
                  {
                    icon: Shield,
                    title: "Private & secure",
                    description: "Your data is encrypted and never shared. Videos are deleted after processing.",
                  },
                ].map((feature, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                      <feature.icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-zinc-900 dark:text-white">
                        {feature.title}
                      </h3>
                      <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-blue-600">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to take control of your spending?
          </h2>
          <p className="text-blue-100 mb-8 max-w-2xl mx-auto">
            Join thousands of users who track their expenses effortlessly with AI.
          </p>
          <Link href="/sign-up">
            <Button size="lg" variant="secondary" className="text-lg px-8 py-6">
              Start Tracking Free →
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <img src="/logo.jpg" alt="Spend" className="h-8 w-8 rounded-lg" />
              <span className="font-semibold">Spend</span>
            </div>
            <p className="text-sm text-zinc-500">
              © 2026 Spend. Built with ❤️ by mykclawd.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
