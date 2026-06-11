import { defineLaunchableState, mountStateLauncher } from '../src/index'

const status = document.querySelector<HTMLParagraphElement>('#status')!

const billingPaymentFailed = defineLaunchableState('billing.paymentFailed', {
  label: 'Payment failed',
  description: 'Customer has a failed payment method.',
  tags: ['billing', 'card'],
  launch() {
    status.textContent = 'Launched billing.paymentFailed'
  },
})

defineLaunchableState('billing.emptyInvoices', {
  label: 'Empty invoices',
  description: 'Customer has no invoices.',
  tags: ['billing'],
  launch() {
    status.textContent = 'Launched billing.emptyInvoices'
  },
})

defineLaunchableState('inbox.manyMessages', {
  label: 'Many messages',
  description: 'Inbox is full of unread messages.',
  tags: ['inbox'],
  async launch() {
    status.textContent = 'Launched inbox.manyMessages'
    await billingPaymentFailed.launch()
  },
})

defineLaunchableState('inbox.launchError', {
  label: 'Launch error',
  description: 'Shows panel error handling.',
  tags: ['inbox', 'error'],
  launch() {
    throw new Error('Demo command failed.')
  },
})

mountStateLauncher({
  initiallyOpen: true,
  position: 'bottom-right',
  title: 'Demo commands',
})
