export type ServiceCode = 'consultation' | 'cleaning';

export interface DoctorServiceInfo {
    durationMinutes: number;
}

export interface DoctorProfile {
    doctorId: number;
    fullName: string;
    services: Partial<Record<ServiceCode, DoctorServiceInfo>>;
}

export const DOCTORS_DATA: DoctorProfile[] = [
    {
        doctorId: 5214888,
        fullName: 'Аубакирова Мадина Мухтаровна',
        services: {
            consultation: { durationMinutes: 60 },
        },
    },
    {
        doctorId: 2319468,
        fullName: 'Налибаев Рамазан Бахытжанович',
        services: {
            consultation: { durationMinutes: 60 },
        },
    },
    {
        doctorId: 1333453,
        fullName: 'Мухаметжан Анель Бауыржановна',
        services: {
            consultation: { durationMinutes: 30 },
            cleaning: { durationMinutes: 40 },
        },
    },
    {
        doctorId: 2319466,
        fullName: 'Тен Виктория Олеговна',
        services: {
            consultation: { durationMinutes: 30 },
            cleaning: { durationMinutes: 40 },
        },
    },
    {
        doctorId: 3296446,
        fullName: 'Муратова Фатима Армановна',
        services: {
            consultation: { durationMinutes: 50 },
            cleaning: { durationMinutes: 50 },
        },
    },
    {
        doctorId: 3125899,
        fullName: 'Ким Валерия Александровна',
        services: {
            consultation: { durationMinutes: 60 },
            cleaning: { durationMinutes: 60 },
        },
    },
    {
        doctorId: 4738000,
        fullName: 'Манатауов Темирлан Асланбекович',
        services: {
            consultation: { durationMinutes: 60 },
            cleaning: { durationMinutes: 60 },
        },
    },
    {
        doctorId: 5249509,
        fullName: 'Махнова Ксения Олеговна',
        services: {
            consultation: { durationMinutes: 60 },
            cleaning: { durationMinutes: 60 },
        },
    },
    {
        doctorId: 4033105,
        fullName: 'Ильясов Нуржан Казисович',
        services: {
            consultation: { durationMinutes: 60 },
        },
    },
];