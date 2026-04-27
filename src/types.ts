export interface Review {
    userId: string;
    username: string;
    rating: number;
    comment: string;
    timestamp: number;
}

export interface Product {
    id: string;
    name: string;
    price: number; // in USD
    category: string;
    accounts: string[]; // List of account details (email:pass)
    reviews?: Review[];
}

export interface User {
    id: string; // Telegram ID
    username?: string;
    balance: number;
    isAdmin: boolean;
    referredBy?: string; // The ID of the person who referred this user
    referralCount: number;
    totalAffiliateEarnings: number;
    v?: number; // Version for force update
}

export interface Order {
    id: string;
    userId: string;
    productId: string;
    productName: string;
    accountDetail: string;
    amount: number;
    timestamp: number;
}

export interface Transaction {
    id: string;
    userId: string;
    amount: number;
    type: 'deposit' | 'purchase';
    status: 'pending' | 'completed' | 'failed';
    txHash?: string;
    timestamp: number;
}
