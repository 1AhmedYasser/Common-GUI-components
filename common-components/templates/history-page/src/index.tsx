import {FC, PropsWithChildren, useEffect, useMemo, useRef, useState} from 'react';
import type {ComponentProps} from 'react';
import {useTranslation} from 'react-i18next';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {ColumnPinningState, createColumnHelper, PaginationState, SortingState,} from '@tanstack/react-table';
import {endOfDay, format, formatISO, startOfDay} from "date-fns";
import {AxiosError} from 'axios';
import './History.scss';
import {MdOutlineRemoveRedEye} from 'react-icons/md';
import {CgSpinner} from 'react-icons/cg';

import {
    Button,
    Card,
    DataTable,
    Dialog,
    Drawer,
    FormCheckbox,
    FormCombobox,
    FormDatepicker,
    FormInput,
    HistoricalChat,
    Icon,
    Tooltip,
    Track,
} from '../../../ui-components';

import {Chat as ChatType, CHAT_EVENTS, CHAT_STATUS} from '../../../types/chat';
import {apiDev, apiDevEnded} from '../../../services';
import {Controller, useForm} from 'react-hook-form';
import {useLocation, useSearchParams} from 'react-router-dom';
import {unifyDateFromat} from './unfiyDate';
import {et} from 'date-fns/locale';
import {useDebouncedCallback} from 'use-debounce';
import {UserInfo} from "../../../types/userInfo";
import {ToastContextType} from "../../../context";

import {getDomainsArray} from "../../../utils/multiDomain-utils";
import {StoreState} from "../../../store";
import {saveFile} from "../../../services/file";
import {ChatMetadataPanel, HeaderCombobox, QualitySettings, SelectedFilterTags} from './components';
import { CharMeasurementType } from './types';
import { ALL_COLUMNS_VALUE } from './constants';

type HistoryProps = {
    user: UserInfo | null;
    userDomains: StoreState;
    toastContext: ToastContextType | null;
    onMessageClick?: (message: any) => void;
    showComment?: boolean;
    showDownload?: boolean;
    showEmail?: boolean;
    showSortingLabel?: boolean;
    showStatus?: boolean;
    displayTitle?: boolean;
    displaySearchBar?: boolean;
    displayDateFilter?: boolean;
    delegatedStartDate?: string;
    delegatedEndDate?: string;
}

type ExportResult = {
    headers: string[];
    rows: (string | number | null)[][];
    chatIds: string[];
};

type QualitySettingsConfig = {
    readonly chatAnalysisEnabled: boolean;
    readonly chatAnalysisTheme: string[];
    readonly chatAnalysisBykResponseQuality: string[];
    readonly chatAnalysisFollowUpAction: string[];
};

export type DomainSelection = {
    readonly id: string;
    readonly name: string;
    readonly url: string;
    readonly selected: boolean;
};

type FeedbackConfig = {
    readonly isFiveRatingScale?: string | boolean;
};

const GLOBAL_FEEDBACK_CONFIG_DOMAIN = 'none';

export const MEASUREMENT_TYPES = {
    THEME: 'THEME',
    QUALITY: 'QUALITY',
    FOLLOW_UP_ACTION: 'FOLLOW_UP_ACTION',
} as const;

export type MeasurementType =
    (typeof MEASUREMENT_TYPES)[keyof typeof MEASUREMENT_TYPES];


export const postQualityMeasurements = (body: {
    readonly chatUuid: string;
    readonly type: MeasurementType;
    readonly value: string | string[];
}) =>
    apiDev.post('chats/quality/measurements', body);

export const getQualityMeasurements = (params: {
    readonly chatUuid: string;
}) =>
    apiDev.get<{
        readonly response: CharMeasurementType[];
    }>('chats/quality/measurements', { params });

export const getWidgetData = async (userId: string) => {
    const { data } = await apiDev.get<DomainSelection[]>('accounts/widget-data', {
        params: {
            user_id: userId,
        },
    });
    return data;
}

const loadQualitySettingsConfig = async (domain: string): Promise<QualitySettingsConfig> => {
    const response = await apiDev.get<{
        readonly response: {
            readonly chatAnalysisEnabled: boolean;
            readonly chatAnalysisTheme: string; // can be an empty string if no themes are defined
            readonly chatAnalysisBykResponseQuality: string; // can be an empty string if no qualities are defined
            readonly chatAnalysisFollowUpAction: string; // can be an empty string if no follow-up actions are defined
        };
    }>('/configs/chat-analysis', {
        params: { domain },
    });
    return {
        chatAnalysisEnabled: response.data.response.chatAnalysisEnabled,
        chatAnalysisTheme: response.data.response.chatAnalysisTheme.split(',').filter(Boolean),
        chatAnalysisBykResponseQuality: response.data.response.chatAnalysisBykResponseQuality.split(',').filter(Boolean),
        chatAnalysisFollowUpAction: response.data.response.chatAnalysisFollowUpAction.split(',').filter(Boolean),
    };
}

const loadFeedbackConfig = async (): Promise<FeedbackConfig> => {
    const response = await apiDev.get('/configs/feedback', {
        params: { domain: GLOBAL_FEEDBACK_CONFIG_DOMAIN },
    });

    return response.data.response ?? response.data;
}

const isFiveRatingScaleEnabled = (value?: string | boolean | null) =>
    value === true || value === 'true';

const formatChatAnalysisCell = (
    value: string[] | null | undefined,
    selectionEmptiedLabel: string
) => {
    if (!Array.isArray(value) || value.length === 0) {
        return '';
    }

    if (value.length === 1 && value[0] === '') {
        return selectionEmptiedLabel;
    }

    return value.join(', ');
};

// Boolean -> truthy values before falsy
// For other columns -> desc before asc - populated before empty
const NON_EMPTY_FIRST_SORT_COLUMN_IDS = new Set([
    'authenticatedPerson',
    'istest',
    'isPreserve',
    'followUpStatus',
    'responseQuality',
    'theme',
]);
const CHAT_STATUSES = [
    CHAT_EVENTS.ACCEPTED,
    CHAT_EVENTS.CLIENT_LEFT_FOR_UNKNOWN_REASONS,
    CHAT_EVENTS.CLIENT_LEFT_WITH_ACCEPTED,
    CHAT_EVENTS.CLIENT_LEFT_WITH_NO_RESOLUTION,
    CHAT_EVENTS.HATE_SPEECH,
    CHAT_EVENTS.OTHER,
    CHAT_EVENTS.RESPONSE_SENT_TO_CLIENT_EMAIL,
];

const getEndedChatsSortBy = (sorting: SortingState) => {
    if (sorting.length === 0) {
        return 'created desc';
    }

    const [sortingObject] = sorting;
    const sortType = NON_EMPTY_FIRST_SORT_COLUMN_IDS.has(sortingObject.id)
        ? sortingObject.desc ? 'asc' : 'desc'
        : sortingObject.desc ? 'desc' : 'asc';

    return `${sortingObject.id} ${sortType}`;
};

const ChatHistory: FC<PropsWithChildren<HistoryProps>> = ({
                                                              user,
                                                              userDomains,
                                                              toastContext,
                                                              onMessageClick,
                                                              showComment = true,
                                                              showDownload = false,
                                                              showEmail = false,
                                                              showSortingLabel = false,
                                                              showStatus = true,
                                                              displayTitle = true,
                                                              displayDateFilter = true,
                                                              displaySearchBar = true,
                                                              delegatedEndDate = null,
                                                              delegatedStartDate = null
                                                          }) => {
    const {t, i18n} = useTranslation();
    const queryClient = useQueryClient();
    const toast = toastContext;
    const userInfo = user;
    const routerLocation = useLocation();
    const params = new URLSearchParams(routerLocation.search);
    let passedChatId = new URLSearchParams(routerLocation.search).get('chat');
    const passedStartDate = delegatedStartDate ?? params.get("start");
    const passedEndDate = delegatedEndDate ?? params.get("end");
    const skipNextSelectedColumnsEffect = useRef(false);
    const skipInitialTableHeaderFilterEffect = useRef(true);
    const [selectedChat, setSelectedChat] = useState<ChatType | null>(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const [statusChangeModal, setStatusChangeModal] = useState<string | null>(
        null
    );
    const [chatState, setChatState] = useState<string | null>(statusChangeModal);
    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: searchParams.get('page')
            ? parseInt(searchParams.get('page') as string) - 1
            : 0,
        pageSize: 10,
    });
    const [sorting, setSorting] = useState<SortingState>([]);
    const columnPinning: ColumnPinningState = {
        left: [],
        right: ['detail'],
    };
    const [totalPages, setTotalPages] = useState<number>(1);
    const [totalCount, setTotalCount] = useState<number | null>(null);
    const [initialLoad, setInitialLoad] = useState<boolean>(true);
    const [filteredEndedChatsList, setFilteredEndedChatsList] = useState<
        ChatType[]
    >([]);

    const [messagesTrigger, setMessagesTrigger] = useState(false);
    const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
    const [counterKey, setCounterKey] = useState<number>(0)

    const useStore = userDomains;
    const [updateKey, setUpdateKey] = useState<number>(0)
    const currentDomains = useStore.getState().userDomains as string[];
    const multiDomainEnabled = import.meta.env.REACT_APP_ENABLE_MULTI_DOMAIN?.toLowerCase() === 'true';
    const testMessageEnabled = import.meta.env.REACT_APP_SHOW_TEST_MESSAGE?.toLowerCase() === 'true';
    const envVal = import.meta.env.REACT_APP_SHOW_TEST_CONVERSATIONS;
    const showTest = envVal === undefined ? true : envVal.toLowerCase() === 'true';
    const [loading, setLoading] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const timeoutAbortRef = useRef(false);

    const userWidgetDomains = useQuery<DomainSelection[]>({
        queryKey: ['accounts/widget-data', userInfo?.idCode],
        queryFn: () => getWidgetData(userInfo!.idCode),
        enabled: !!userInfo?.idCode,
    });

    const parseDateParam = (dateString: string | null) => {
      if (!dateString) return new Date();
      return new Date(dateString.split("+")[0]);
    };

    const { control, setValue, watch } = useForm<{
      startDate: Date | string;
      endDate: Date | string;
      search: string;
    }>({
      defaultValues: {
        startDate: passedStartDate ? parseDateParam(passedStartDate) : startOfDay(new Date()),
        endDate: passedEndDate ? parseDateParam(passedEndDate) : endOfDay(new Date()),
        search: '',
      },
    });

    const search = watch('search');
    const startDate = watch('startDate');
    const endDate = watch('endDate');

    const debouncedGetAllEnded = useDebouncedCallback((search) => {
        getAllEndedChats.mutate({
            startDate: formatISO(startOfDay(new Date(startDate))),
            endDate: formatISO(endOfDay(new Date(endDate))),
            pagination,
            sorting,
            search,
        });
    }, 500);

    useEffect(() => {
        if (!multiDomainEnabled) return;

        const unsubscribe = useStore.subscribe((state, prevState) => {
            if (
                JSON.stringify(state.userDomains) !==
                JSON.stringify(prevState.userDomains)
            ) {
                setUpdateKey((v) => v + 1);
            }
        });

        return () => unsubscribe();
    }, [multiDomainEnabled, useStore]);

    useEffect(() => {
        if (passedChatId != null) {
            getChatById.mutate();
            passedChatId = null;
        }
    }, [passedChatId]);

    useEffect(() => {
        const hasStart = delegatedStartDate !== null && delegatedStartDate !== undefined;
        const hasEnd = delegatedEndDate !== null && delegatedEndDate !== undefined;

        if (hasStart || hasEnd) {
            if (hasStart) {
                setValue('startDate', unifyDateFromat(delegatedStartDate));
            }
            if (hasEnd) {
                setValue('endDate', unifyDateFromat(delegatedEndDate));
            }

            if (initialLoad) {
                fetchData()
            } else {
                getAllEndedChats.mutate({
                    startDate: hasStart ? unifyDateFromat(delegatedStartDate) : formatISO(startOfDay(new Date(startDate))),
                    endDate: hasEnd ? unifyDateFromat(delegatedEndDate) : formatISO(endOfDay(new Date(endDate))),
                    pagination,
                    sorting,
                    search,
                });
            }
        }
    }, [delegatedStartDate, delegatedEndDate, updateKey]);


    const fetchData = async () => {
        setInitialLoad(false);
        try {
            const response = await apiDev.get('/accounts/get-page-preference', {
                params: {
                    user_id: userInfo?.idCode,
                    page_name: window.location.pathname,
                },
            });

            if (response.data) {
                const currentColumns = response.data.selectedColumns;
                const newPageResults = response.data.pageResults !== undefined ? response.data.pageResults : 10;
                const updatedPagination = updatePagePreference(newPageResults);

                let newSelectedColumns = [];
                if (currentColumns?.length > 0 && currentColumns[0] !== "") {
                    newSelectedColumns = currentColumns;
                }

                skipNextSelectedColumnsEffect.current = true;
                setSelectedColumns(getUiSelectedColumns(newSelectedColumns));
                setCounterKey(prev => prev + 1);

                getAllEndedChats.mutate({
                    startDate: formatISO(startOfDay(new Date(startDate))),
                    endDate: formatISO(endOfDay(new Date(endDate))),
                    pagination: updatedPagination,
                    sorting,
                    search,
                });
            }
        } catch (err) {
            console.error('Failed to fetch data', err);
        }
    };

    const updatePagePreference = (pageResults: number): PaginationState => {
        const updatedPagination: PaginationState = {
            ...pagination,
            pageSize: pageResults,
        };
        setPagination(updatedPagination);
        return updatedPagination;
    };

    const selectedChatDomainUuid = useMemo(() => {
        return userWidgetDomains.data?.find(domain => domain.url === selectedChat?.endUserUrl)?.id ?? null;
    }, [selectedChat]);
    const qualitySettingsConfigQuery = useQuery<QualitySettingsConfig>({
        queryKey: ['configs/chat-analysis', selectedChatDomainUuid ?? GLOBAL_FEEDBACK_CONFIG_DOMAIN],
        queryFn: () => loadQualitySettingsConfig(selectedChatDomainUuid ? selectedChatDomainUuid : GLOBAL_FEEDBACK_CONFIG_DOMAIN),
    });

    const isChatAnalysisEnabled = useMemo(() => {
        return qualitySettingsConfigQuery.data?.chatAnalysisEnabled ?? false;
    }, [qualitySettingsConfigQuery.data]);

    useEffect(() => {
        if (initialLoad) {
            if (qualitySettingsConfigQuery.isLoading) return;
            fetchData();
        } else if (skipNextSelectedColumnsEffect.current) {
            skipNextSelectedColumnsEffect.current = false;
        } else {
            getAllEndedChats.mutate({
                startDate: formatISO(startOfDay(new Date(startDate))),
                endDate: formatISO(endOfDay(new Date(endDate))),
                pagination,
                sorting,
                search,
            });
        }
    }, [selectedColumns, currentDomains, qualitySettingsConfigQuery.isLoading]);

    const updatePagePreferences = useMutation({
        mutationFn: (data: {
            page_results: number;
            selected_columns: string[];
        }) => {
            return apiDev.post('accounts/update-page-preference', {
                user_id: userInfo?.idCode,
                page_name: window.location.pathname,
                page_results: data.page_results,
                selected_columns: `{"${data.selected_columns.join('","')}"}`
            });
        },
    });

    const getAllEndedChats = useMutation({
        mutationFn: (data: {
            startDate: string;
            endDate: string;
            pagination: PaginationState;
            sorting: SortingState;
            search: string;
            urls?: string[];
        }) => {
            abortRef.current?.abort();
            abortRef.current = new AbortController();

            const sortBy = getEndedChatsSortBy(data.sorting);

            return apiDevEnded.post('agents/chats/ended', {
                startDate: formatISO(startOfDay(new Date(data.startDate))),
                endDate: formatISO(endOfDay(new Date(data.endDate))),
                ...endedChatsFilterBody,
                ...(data.urls?.length ? {urls: getDomainsArray(data.urls)} : {}),
                page: data.pagination.pageIndex + 1,
                page_size: data.pagination.pageSize,
                sorting: sortBy,
                search,
            },
                {
                    params: { isChatAnalysisEnabled },
                    signal: abortRef.current.signal
                }
            );
        },
        onSuccess: (res: any) => {
            if (selectedChat)
                setSelectedChat({
                    ...selectedChat,
                    lastMessageEvent: res.data.response[0].lastMessageEvent,
                    lastMessageTimestamp: res.data.response[0].lastMessageTimestamp,
                    userDisplayName: res.data.response[0].userDisplayName,
                });
            filterChatsList(res.data.response ?? []);
            setTotalPages(res?.data?.response[0]?.totalPages ?? 1);
            setTotalCount(res?.data?.response[0]?.totalCount ?? null);
        },
        onError: (error: AxiosError) => {
            if (error.code === 'ERR_CANCELED' && !timeoutAbortRef.current) return;
            timeoutAbortRef.current = false;
            toast?.open({
                type: 'error',
                title: t('global.notificationError'),
                message: 'Veateade',
            });
        },
    });

    useEffect(() => {
        if (getAllEndedChats.isPending) {
            loadingTimeoutRef.current = setTimeout(() => {
                timeoutAbortRef.current = true;
                abortRef.current?.abort();
            }, 10000);
        } else if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
                loadingTimeoutRef.current = null;
            }
        return () => {
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        };
    }, [getAllEndedChats.isPending]);

    const getChatById = useMutation({
        mutationFn: () =>
            apiDev.post('chats/get', {
                chatId: passedChatId,
            }),
        onSuccess: (res: any) => {
            setSelectedChat(res.data.response);
            setChatState(res.data.response);
        },
    });

    const realColumnOptions: {readonly label: string; readonly value: string}[] = useMemo(() => {
        const columns = [
            {label: t('chat.history.startTime'), value: 'created'},
            {label: t('chat.history.endTime'), value: 'ended'},
            {label: t('chat.history.csaName'), value: 'customerSupportFullName'},
            {label: t('chat.history.authenticatedPerson'), value: 'authenticatedPerson'},
            {label: t('chat.history.comment'), value: 'comment'},
            {label: t('chat.history.rating'), value: 'feedbackRating'},
            {label: t('chat.history.feedback'), value: 'feedbackText'},
            {label: t('global.status'), value: 'status'},
            {label: 'ID', value: 'id'},
            {label: 'www', value: 'www'},
        ];

        if (showEmail) {
            columns.splice(4, 0, {label: t('global.email'), value: 'endUserEmail'});
        }

        if (testMessageEnabled) {
            columns.splice(5, 0, {label: t('global.test'), value: 'istest'});
        }

        columns.splice(5, 0, {label: t('global.preserve'), value: 'isPreserve'});

        if (isChatAnalysisEnabled) {
            columns.push(
                {label: t('chat.history.theme'), value: 'theme'},
                {label: t('chat.history.responseQuality'), value: 'responseQuality'},
                {label: t('chat.history.followUpStatus'), value: 'followUpStatus'}
            );
        }

        return columns;
    }, [t, showEmail, testMessageEnabled, isChatAnalysisEnabled])

    const visibleColumnOptions = useMemo(() => [
        {label: t('chat.history.chooseAll'), value: ALL_COLUMNS_VALUE},
        ...realColumnOptions,
    ], [t, realColumnOptions]);

    const getRealSelectedColumns = (columns: string[]) =>
        columns.filter((column) => column !== ALL_COLUMNS_VALUE);

    const getAllColumnValues = () => realColumnOptions.map((option) => option.value);

    const areAllColumnsSelected = (columns: string[]) => {
        const realSelectedColumns = getRealSelectedColumns(columns);
        const allColumnValues = getAllColumnValues();

        return allColumnValues.length > 0 &&
            allColumnValues.every((column) => realSelectedColumns.includes(column));
    };

    const getUiSelectedColumns = (columns: string[]) => {
        const realSelectedColumns = getRealSelectedColumns(columns);

        if (areAllColumnsSelected(realSelectedColumns)) {
            const allColumnValues = getAllColumnValues();
            const extraSelectedColumns = realSelectedColumns.filter(
                (column) => !allColumnValues.includes(column)
            );

            return [ALL_COLUMNS_VALUE, ...allColumnValues, ...extraSelectedColumns];
        }

        return realSelectedColumns;
    };

    const chatStatusChangeMutation = useMutation({
        mutationFn: async (data: { chatId: string | number; event: string }) => {
            const changeableTo = [
                CHAT_EVENTS.CLIENT_LEFT_WITH_ACCEPTED.toUpperCase(),
                CHAT_EVENTS.CLIENT_LEFT_WITH_NO_RESOLUTION.toUpperCase(),
                CHAT_EVENTS.ACCEPTED.toUpperCase(),
                CHAT_EVENTS.ANSWERED.toUpperCase(),
                CHAT_EVENTS.CLIENT_LEFT_FOR_UNKNOWN_REASONS.toUpperCase(),
                CHAT_EVENTS.CLIENT_LEFT.toUpperCase(),
                CHAT_EVENTS.HATE_SPEECH.toUpperCase(),
                CHAT_EVENTS.OTHER.toUpperCase(),
                CHAT_EVENTS.TERMINATED.toUpperCase(),
                CHAT_EVENTS.RESPONSE_SENT_TO_CLIENT_EMAIL.toUpperCase(),
            ];
            const isChangeable = changeableTo.includes(data.event);

            if (selectedChat?.lastMessageEvent === data.event.toLowerCase()) return;

            if (!isChangeable) return;

            await apiDev.post('chats/status', {
                chatId: selectedChat!.id,
                event: data.event.toUpperCase(),
                authorTimestamp: new Date().toISOString(),
                authorFirstName: userInfo!.firstName,
                authorId: userInfo!.idCode,
                authorRole: userInfo!.authorities,
            });
        },
        onSuccess: () => {
            setMessagesTrigger(!messagesTrigger);
            getAllEndedChats.mutate({
                startDate: formatISO(startOfDay(new Date(startDate))),
                endDate: formatISO(endOfDay(new Date(endDate))),
                pagination,
                sorting,
                search,
            });
            toast?.open({
                type: 'success',
                title: t('global.notification'),
                message: t('toast.success.chatStatusChanged'),
            });
            setStatusChangeModal(null);
        },
        onError: (error: AxiosError) => {
            toast?.open({
                type: 'error',
                title: t('global.notificationError'),
                message: error.message,
            });
        },
        onSettled: () => setStatusChangeModal(null),
    });

    const chatCommentChangeMutation = useMutation({
        mutationFn: (data: {
            chatId: string | number;
            comment: string;
            authorDisplayName: string;
        }) => apiDev.post('comments/history', data),
        onSuccess: (res, {chatId, comment}) => {
            const updatedChatList = filteredEndedChatsList.map((chat) =>
                chat.id === chatId ? {...chat, comment} : chat
            );
            filterChatsList(updatedChatList);
            if (selectedChat)
                setSelectedChat({
                    ...selectedChat,
                    comment,
                    commentAddedDate: res.data.response[0].created,
                    commentAuthor: res.data.response[0].authorDisplayName,
                });
            toast?.open({
                type: 'success',
                title: t('global.notification'),
                message: t('toast.success.chatCommentChanged'),
            });
        },
        onError: (error: AxiosError) => {
            toast?.open({
                type: 'error',
                title: t('global.notificationError'),
                message: error.message,
            });
        },
    });

    const chatTestChangeMutation = useMutation({
        mutationFn: (data: {
            chatId: string | number;
            isTest: boolean;
        }) => apiDev.post('chats/mark-test', data),
        onSuccess: (res, {chatId, isTest}) => {
            const updatedChatList = filteredEndedChatsList.map((chat) =>
                chat.id === chatId ? {...chat, isTest} : chat
            );
            filterChatsList(updatedChatList);
            toast?.open({
                type: 'success',
                title: t('global.notification'),
                message: t('toast.success.updateSuccess'),
            });
        },
        onError: (error: AxiosError) => {
            toast?.open({
                type: 'error',
                title: t('global.notificationError'),
                message: error.message,
            });
        },
    });

    const chatPreserveChangeMutation = useMutation({
        mutationFn: (data: {
            chatId: string | number;
            isPreserve: boolean;
        }) => apiDev.post('chats/mark-preserve', data),
        onSuccess: (res, {chatId, isPreserve}) => {
            const updatedChatList = filteredEndedChatsList.map((chat) =>
                chat.id === chatId ? {...chat, isPreserve: isPreserve} : chat
            );
            filterChatsList(updatedChatList);
            toast?.open({
                type: 'success',
                title: t('global.notification'),
                message: t('toast.success.updateSuccess'),
            });
        },
        onError: (error: AxiosError) => {
            toast?.open({
                type: 'error',
                title: t('global.notificationError'),
                message: error.message,
            });
        },
    });

    const columnHelper = createColumnHelper<ChatType>();

    const copyValueToClipboard = async (value: string) => {
        await navigator.clipboard.writeText(value);

        toast?.open({
            type: 'success',
            title: t('global.notification'),
            message: t('toast.success.copied'),
        });
    };

    const commentView = (props: any) =>
        props.getValue() && (
            <Tooltip content={props.getValue()}>
        <span
            onClick={() => copyValueToClipboard(props.getValue())}
            style={{cursor: 'pointer'}}
        >
          {props.getValue().length <= 25
              ? props.getValue()
              : `${props.getValue()?.slice(0, 25)}...`}
        </span>
            </Tooltip>
        );

    const feedbackTextView = (props: any) => {
        const value = props.getValue() ?? '';

        return (
            <Tooltip content={value}>
        <span style={{minWidth: '250px'}}>
          {value.length < 30 ? value : `${value?.slice?.(0, 30)}...`}
        </span>
            </Tooltip>
        );
    };

    const wwwView = (props: any) => {
        const value = props.getValue() ?? '';
        const isTruncated = value.length > 40;
        const displayValue = isTruncated ? `${value.slice(0, 40)}...` : value;

        const button = (
            <button onClick={() => copyValueToClipboard(value)} style={{cursor: 'pointer'}}>
                {displayValue}
            </button>
        );

        return isTruncated ? <Tooltip content={value}>{button}</Tooltip> : button;
    };

    const statusView = (props: any) => {
        const isLastMessageEvent =
            props.row.original.lastMessageEvent != null &&
            props.row.original.lastMessageEvent !== 'message-read'
                ? t('chat.plainEvents.' + props.row.original.lastMessageEvent)
                : t('chat.status.ended');
        return props.getValue() === CHAT_STATUS.ENDED ? isLastMessageEvent : '';
    };

    const idView = (props: any) => (
        <Tooltip content={props.getValue()}>
      <span
          onClick={() => copyValueToClipboard(props.getValue())}
          style={{cursor: 'pointer'}}
      >
        {props.getValue().split('-')[0]}
      </span>
        </Tooltip>
    );

    const updateChatTest = function (chatId: string, isTest: boolean) {
      setFilteredEndedChatsList((prevChats) =>
        prevChats.map((chat) => (chat.id === chatId ? ({ ...chat, istest: isTest } as ChatType) : chat))
      );

      if (selectedChat && selectedChat.id === chatId) {
        setSelectedChat({
          ...selectedChat,
          istest: isTest,
        } as ChatType);
      }
    };

    const updateChatPreserve = function (chatId: string, isPreserve: boolean) {
      setFilteredEndedChatsList((prevChats) =>
        prevChats.map((chat) => (chat.id === chatId ? ({ ...chat, isPreserve: isPreserve } as ChatType) : chat))
      );

      if (selectedChat?.id === chatId) {
        setSelectedChat({
          ...selectedChat,
          isPreserve: isPreserve,
        } as ChatType);
      }
    };

    const markConversationAsTest = (props: any) => {
      const chatId = props.row.original.id;
      const newIsTestValue = props.getValue();
      return (
        <FormCheckbox
          checked={newIsTestValue}
          label={""}
          hideLabel
          emptyItem={true}
          name="active"
          item={{
            label: "",
            value: "active",
          }}
          onChange={(e) => {
            const isTest = e.target.checked;
            updateChatTest(chatId, isTest);
            chatTestChangeMutation.mutate({ chatId, isTest });
          }}
        />
      );
    };

    const markConversationAsPreserve = (props: any) => {
      const chatId = props.row.original.id;
      const newIsPreserveValue = props.getValue();
      return (
        <FormCheckbox
          checked={newIsPreserveValue}
          label={""}
          hideLabel
          emptyItem={true}
          name="active"
          item={{
            label: "",
            value: "active",
          }}
          onChange={(e) => {
            const isPreserve = e.target.checked;
            updateChatPreserve(chatId, isPreserve);
            chatPreserveChangeMutation.mutate({ chatId, isPreserve });
          }}
        />
      );
    };

    const detailsView = (props: any) => (
        <Button
            appearance="text"
            onClick={() => {
                setSelectedChat(props.row.original);
                setSearchParams((params) => {
                    params.set("chat", props.row.original.id);
                    return params;
                });
                setChatState(props.row.original.lastMessageEvent);
            }}
        >
            <Icon icon={<MdOutlineRemoveRedEye color={'rgba(0,0,0,0.54)'}/>}/>
            {t('global.view')}
        </Button>
    );

    const customerSupportAgentsQuery = useQuery({
        queryKey: ['customer-support-agents'],
        queryFn: () =>
            apiDev.post<{
                readonly response: {
                    readonly login: string;
                    readonly firstName: string;
                    readonly lastName: string;
                    readonly idCode: string;
                    readonly displayName: string;
                    readonly csaTitle: string;
                    readonly csaEmail: string;
                    readonly department: string;
                    readonly jiraAccountId: string;
                    readonly smaxAccountId: string;
                    readonly authorities: string[];
                    readonly customerSupportStatus: string;
                    readonly statusComment: string;
                    readonly statusCommentTimeStamp: string;
                    readonly domains: (string | null)[] | null;
                    readonly totalPages: number;
                }[];
            }>('accounts/customer-support-agents', {
                page: 0,
                page_size: 99999,
                sorting: 'name asc',
                show_active_only: false,
                roles: ['ROLE_CUSTOMER_SUPPORT_AGENT'],
            }),
        select: (result) => {
            return [
                { label: t('chat.history.chooseAll'), value: ALL_COLUMNS_VALUE },
                { label: 'Bürokratt', value: 'chatbot' },
                ...result.data.response.map((item) => ({
                    label: [item.firstName, item.lastName].join(' ').trim(),
                    value: item.idCode,
                })),
            ]
        },
    });

    const tableHeaderForm = useForm<{
        readonly csaIdCodesFilter: string[];
        readonly feedbackRatings: string[];
        readonly showAuthenticatedPerson?: boolean;
        readonly isTestFilter?: boolean;
        readonly isPreserveFilter?: boolean;
        readonly hasCommentFilter?: boolean;
        readonly hasFeedbackFilter?: boolean;
        readonly domains: string[];
        readonly status: string[];
        readonly theme: string[];
        readonly responseQuality: string[];
        readonly followUpStatus: string[];
    }>({
        defaultValues: {
            csaIdCodesFilter: [],
            feedbackRatings: [],
            showAuthenticatedPerson: undefined,
            isTestFilter: undefined,
            isPreserveFilter: undefined,
            hasCommentFilter: undefined,
            hasFeedbackFilter: undefined,
            domains: [],
            status: [],
            theme: [],
            responseQuality: [],
            followUpStatus: [],
        },
    });
    const { reset: resetTableHeaderForm, setValue: setTableHeaderValue } = tableHeaderForm;
    const csaIdCodesFilter = tableHeaderForm.watch('csaIdCodesFilter');
    const feedbackRatings = tableHeaderForm.watch('feedbackRatings');
    const showAuthenticatedPerson = tableHeaderForm.watch('showAuthenticatedPerson');
    const isTestFilter = tableHeaderForm.watch('isTestFilter');
    const isPreserveFilter = tableHeaderForm.watch('isPreserveFilter');
    const hasCommentFilter = tableHeaderForm.watch('hasCommentFilter');
    const hasFeedbackFilter = tableHeaderForm.watch('hasFeedbackFilter');
    const domains = tableHeaderForm.watch('domains');
    const status = tableHeaderForm.watch('status');
    const theme = tableHeaderForm.watch('theme');
    const responseQuality = tableHeaderForm.watch('responseQuality');
    const followUpStatus = tableHeaderForm.watch('followUpStatus');

    useEffect(() => {
        if (skipInitialTableHeaderFilterEffect.current) {
            skipInitialTableHeaderFilterEffect.current = false;
            return;
        }

        const resetPagination = { pageIndex: 0, pageSize: pagination.pageSize };
        setPagination(resetPagination);
        setSearchParams((params) => {
            params.set("page", "1");
            return params;
        });
        getAllEndedChats.mutate({
            startDate: formatISO(startOfDay(new Date(startDate))),
            endDate: formatISO(endOfDay(new Date(endDate))),
            pagination: resetPagination,
            sorting,
            search,
        });
    }, [csaIdCodesFilter, feedbackRatings, showAuthenticatedPerson, isTestFilter, isPreserveFilter, hasCommentFilter, hasFeedbackFilter, domains, status, theme, responseQuality, followUpStatus]);

    const getBooleanComboboxValue = (value?: boolean) =>
        value === undefined ? '' : String(value);
    const getBooleanFormValue = (value: string) =>
        value ? value === 'true' : undefined;
    const getBooleanApiFilterValue = (value?: boolean) =>
        value === undefined ? [] : [value];
    const getRealStringFilterValues = (values: string[]) =>
        values.filter((value) => value !== ALL_COLUMNS_VALUE);
    const getAllStringFilterValues = (options: { readonly value: string }[]) =>
        getRealStringFilterValues(options.map((option) => option.value));
    const normalizeAllOptionFilterValues = (
        values: string[],
        currentValues: string[],
        allValues: string[]
    ) => {
        const currentAllSelected = currentValues.includes(ALL_COLUMNS_VALUE);
        const nextAllSelected = values.includes(ALL_COLUMNS_VALUE);

        if (nextAllSelected && !currentAllSelected) {
            return [ALL_COLUMNS_VALUE, ...allValues];
        }

        if (!nextAllSelected && currentAllSelected) {
            return [];
        }

        const realValues = getRealStringFilterValues(values);

        if (allValues.length > 0 && allValues.every((value) => realValues.includes(value))) {
            return [ALL_COLUMNS_VALUE, ...allValues];
        }

        return realValues;
    };
    const getRealCsaFilterValues = (values: string[]) =>
        getRealStringFilterValues(values);
    const getAllCsaFilterValues = () =>
        getRealCsaFilterValues(customerSupportAgentsQuery.data?.map((option) => option.value) ?? []);
    const getFeedbackRatingFilterValues = (values: string[]) =>
        values
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value));
    const normalizeCsaFilterValues = (values: string[]) => {
        const currentAllSelected = csaIdCodesFilter.includes(ALL_COLUMNS_VALUE);
        const nextAllSelected = values.includes(ALL_COLUMNS_VALUE);
        const allCsaFilterValues = getAllCsaFilterValues();

        if (nextAllSelected && !currentAllSelected) {
            return [ALL_COLUMNS_VALUE, ...allCsaFilterValues];
        }

        if (!nextAllSelected && currentAllSelected) {
            return [];
        }

        const realValues = getRealCsaFilterValues(values);

        if (allCsaFilterValues.length > 0 && allCsaFilterValues.every((value) => realValues.includes(value))) {
            return [ALL_COLUMNS_VALUE, ...allCsaFilterValues];
        }

        return realValues;
    };
    const csaFilterTagValues = getRealCsaFilterValues(csaIdCodesFilter);
    const csaFilterTagLabelsByValue = useMemo(() => {
        return new Map(
            (customerSupportAgentsQuery.data ?? []).map((option) => [option.value, option.label])
        );
    }, [customerSupportAgentsQuery.data]);
    const getCsaFilterTagLabel = (value: string) => csaFilterTagLabelsByValue.get(value) ?? value;
    const removeSelectedFilterTag: ComponentProps<typeof SelectedFilterTags>['onRemove'] = (filter, value) => {
        switch (filter) {
            case 'csaIdCodesFilter':
                setTableHeaderValue(
                    filter,
                    getRealCsaFilterValues(csaIdCodesFilter).filter((item) => item !== value)
                );
                return;
            case 'showAuthenticatedPerson':
            case 'isTestFilter':
            case 'isPreserveFilter':
            case 'hasCommentFilter':
            case 'hasFeedbackFilter':
                setTableHeaderValue(filter, undefined);
                return;
            case 'domains':
                setTableHeaderValue(filter, getRealStringFilterValues(domains).filter((item) => item !== value));
                return;
            case 'feedbackRatings':
                setTableHeaderValue(filter, getRealStringFilterValues(feedbackRatings).filter((item) => item !== value));
                return;
            case 'status':
                setTableHeaderValue(filter, getRealStringFilterValues(status).filter((item) => item !== value));
                return;
            case 'theme':
                setTableHeaderValue(filter, getRealStringFilterValues(theme).filter((item) => item !== value));
                return;
            case 'responseQuality':
                setTableHeaderValue(filter, getRealStringFilterValues(responseQuality).filter((item) => item !== value));
                return;
            case 'followUpStatus':
                setTableHeaderValue(filter, getRealStringFilterValues(followUpStatus).filter((item) => item !== value));
        }
    };

    const globalFeedbackConfigQuery = useQuery<FeedbackConfig>({
        queryKey: ['configs/feedback', GLOBAL_FEEDBACK_CONFIG_DOMAIN],
        queryFn: loadFeedbackConfig,
    });

    const tableHeaderQualitySettingsConfigQuery = useQuery<QualitySettingsConfig>({
        queryKey: ['configs/chat-analysis', GLOBAL_FEEDBACK_CONFIG_DOMAIN],
        queryFn: () => loadQualitySettingsConfig(GLOBAL_FEEDBACK_CONFIG_DOMAIN),
    });

    const realRatingOptions = useMemo(() => {
        const isFiveRatingScale = isFiveRatingScaleEnabled(globalFeedbackConfigQuery.data?.isFiveRatingScale);
        const ratingMin = isFiveRatingScale ? 1 : 0;
        const ratingMax = isFiveRatingScale ? 5 : 10;

        return Array.from({ length: ratingMax - ratingMin + 1 }, (_, index) => {
            const rating = ratingMin + index;

            return {
                label: String(rating),
                value: String(rating),
            };
        });
    }, [globalFeedbackConfigQuery.data?.isFiveRatingScale]);

    const ratingOptions = useMemo(() => [
        { label: t('chat.history.chooseAll'), value: ALL_COLUMNS_VALUE },
        ...realRatingOptions,
    ], [t, realRatingOptions]);

    const realStatusOptions = useMemo(() => {
        return CHAT_STATUSES.map((chatStatus) => ({
            label: t(`chat.plainEvents.${chatStatus}`),
            value: chatStatus,
        }));
    }, [t]);

    const statusOptions = useMemo(() => [
        { label: t('chat.history.chooseAll'), value: ALL_COLUMNS_VALUE },
        ...realStatusOptions,
    ], [t, realStatusOptions]);

    const domainOptions = useMemo(() => [
        { label: t('chat.history.chooseAll'), value: ALL_COLUMNS_VALUE },
        ...currentDomains.map((domain) => ({
            label: domain,
            value: domain,
        })),
    ], [t, currentDomains]);

    const realThemeOptions = tableHeaderQualitySettingsConfigQuery.data?.chatAnalysisTheme.map(item => {
        return { label: item, value: item }
    }) ?? [];
    const realResponseQualityOptions = tableHeaderQualitySettingsConfigQuery.data?.chatAnalysisBykResponseQuality.map(item => {
        return { label: item, value: item }
    }) ?? [];
    const realFollowUpStatusOptions = tableHeaderQualitySettingsConfigQuery.data?.chatAnalysisFollowUpAction.map(item => {
        return { label: item, value: item }
    }) ?? [];

    const themeOptions = useMemo(() => [
        { label: t('chat.history.chooseAll'), value: ALL_COLUMNS_VALUE },
        ...realThemeOptions,
    ], [t, realThemeOptions]);

    const responseQualityOptions = useMemo(() => [
        { label: t('chat.history.chooseAll'), value: ALL_COLUMNS_VALUE },
        ...realResponseQualityOptions,
    ], [t, realResponseQualityOptions]);

    const followUpStatusOptions = useMemo(() => [
        { label: t('chat.history.chooseAll'), value: ALL_COLUMNS_VALUE },
        ...realFollowUpStatusOptions,
    ], [t, realFollowUpStatusOptions]);

    const feedbackRatingFilterValues = getRealStringFilterValues(feedbackRatings);
    const statusFilterValues = getRealStringFilterValues(status);
    const domainFilterValues = getRealStringFilterValues(domains);
    const themeFilterValues = getRealStringFilterValues(theme);
    const responseQualityFilterValues = getRealStringFilterValues(responseQuality);
    const followUpStatusFilterValues = getRealStringFilterValues(followUpStatus);

    const endedChatsFilterBody = useMemo(() => {
        const currentCustomerSupportIds = getRealCsaFilterValues(csaIdCodesFilter);
        const currentFeedbackRatings = getFeedbackRatingFilterValues(feedbackRatings);
        const currentStatusValues = getRealStringFilterValues(status);
        const currentDomainValues = getRealStringFilterValues(domains);
        const currentIsTestValues = getBooleanApiFilterValue(isTestFilter);
        const currentShowAuthenticatedPersonValues = getBooleanApiFilterValue(showAuthenticatedPerson);
        const currentIsPreserveValues = getBooleanApiFilterValue(isPreserveFilter);
        const currentHasCommentValues = getBooleanApiFilterValue(hasCommentFilter);
        const currentHasFeedbackValues = getBooleanApiFilterValue(hasFeedbackFilter);
        const currentThemeValues = getRealStringFilterValues(theme);
        const currentResponseQualityValues = getRealStringFilterValues(responseQuality);
        const currentFollowUpStatusValues = getRealStringFilterValues(followUpStatus);

        return {
            urls: getDomainsArray(currentDomainValues.length > 0 ? currentDomainValues : currentDomains),
            showTest: showTest,
            theme: currentThemeValues,
            responseQuality: currentResponseQualityValues,
            followUpStatus: currentFollowUpStatusValues,
            ...(currentCustomerSupportIds.length > 0 && {customerSupportIds: currentCustomerSupportIds}),
            ...(currentFeedbackRatings.length > 0 && {feedbackRatings: currentFeedbackRatings}),
            ...(currentIsTestValues.length > 0 && {isTest: currentIsTestValues}),
            ...(currentShowAuthenticatedPersonValues.length > 0 && {authenticatedChats: currentShowAuthenticatedPersonValues}),
            ...(currentIsPreserveValues.length > 0 && {isPreserve: currentIsPreserveValues}),
            ...(currentHasCommentValues.length > 0 && {hasComment: currentHasCommentValues}),
            ...(currentHasFeedbackValues.length > 0 && {hasFeedback: currentHasFeedbackValues}),
            ...(currentStatusValues.length > 0 && {status: currentStatusValues}),
        };
    }, [
        csaIdCodesFilter,
        currentDomains,
        domains,
        feedbackRatings,
        followUpStatus,
        isPreserveFilter,
        isTestFilter,
        hasCommentFilter,
        hasFeedbackFilter,
        responseQuality,
        showAuthenticatedPerson,
        showTest,
        status,
        theme,
    ]);

    const booleanFilterOptions = useMemo(() => [
        { label: t('global.yes') ?? '', value: 'true' },
        { label: t('global.no') ?? '', value: 'false' },
    ], [t]);

    const endedChatsColumns = useMemo(() => {
        const columns = [
            columnHelper.accessor('created', {
                id: 'created',
                header: t('chat.history.startTime') ?? '',
                cell: (props) =>
                    format(
                        new Date(props.getValue()),
                        'dd.MM.yyyy HH:mm:ss',
                        i18n.language === 'et' ? {locale: et} : undefined
                    ),
            }),
            columnHelper.accessor('ended', {
                id: 'ended',
                header: t('chat.history.endTime') ?? '',
                cell: (props) =>
                    format(
                        new Date(props.getValue()),
                        'dd.MM.yyyy HH:mm:ss',
                        i18n.language === 'et' ? {locale: et} : undefined
                    ),
            }),
            columnHelper.accessor(
                (row) => {
                    if (Array.isArray(row.allCsa) && !(row.allCsa.length === 1 && (row.allCsa[0] == null || row.allCsa[0].toString().trim() === ''))) {
                        const cleanedNames = row.allCsa
                            .filter(name => !!name && typeof name === 'string')
                            .map(name => name.trim())
                            .filter(name => name !== "")
                            .filter((name, index, self) => self.indexOf(name) === index);

                        const filteredNames = cleanedNames.length > 1
                            ? cleanedNames.filter(name => name !== "Bürokratt")
                            : cleanedNames;

                        return filteredNames.join(", ");
                    } else {
                        return "Bürokratt";
                    }
                },
                {
                    id: `customerSupportFullName`,
                    header: () => {
                        return (
                            <HeaderCombobox
                                label={t('chat.history.csaName')}
                                options={customerSupportAgentsQuery.data ?? []}
                                value={csaIdCodesFilter}
                                allOptionValue={ALL_COLUMNS_VALUE}
                                onChange={(value) => {
                                    const normalizedValue = normalizeCsaFilterValues(value);
                                    tableHeaderForm.setValue('csaIdCodesFilter', normalizedValue);
                                }}
                                isApplyBtnVisible
                            />
                        );
                    },
                    sortDescFirst: false,
                }
            ),
            columnHelper.accessor(
                (row) => {
                    const hasData = row.endUserFirstName || row.endUserLastName || row.endUserId || row.contactsMessage;
                    return hasData ? t('global.yes') : '';
                },
                {
                    id: 'authenticatedPerson',
                    header: () => {
                        return (
                            <HeaderCombobox
                                label={t('chat.history.authenticatedPerson') ?? ''}
                                options={booleanFilterOptions}
                                value={getBooleanComboboxValue(showAuthenticatedPerson)}
                                onChange={(value) => {
                                    setTableHeaderValue('showAuthenticatedPerson', getBooleanFormValue(value));
                                }}
                                multiple={false}
                                isSearchEnabled={false}
                            />
                        );
                    },
                    sortDescFirst: false,
                }
            ),
            ...showEmail ? [
                columnHelper.accessor('endUserEmail', {
                    id: 'endUserEmail',
                    header: t('global.email'),
                    sortDescFirst: false,
                })
            ] : [],
            ...testMessageEnabled ? [
                columnHelper.accessor('istest', {
                    id: 'istest',
                    header: () => {
                        return (
                            <HeaderCombobox
                                label={t('global.test')}
                                options={booleanFilterOptions}
                                value={getBooleanComboboxValue(isTestFilter)}
                                onChange={(value) => {
                                    setTableHeaderValue('isTestFilter', getBooleanFormValue(value));
                                }}
                                multiple={false}
                                isSearchEnabled={false}
                            />
                        );
                    },
                    cell: markConversationAsTest,
                    enableSorting: false,
                    sortDescFirst: false,
                })
            ] : [],
            columnHelper.accessor('isPreserve', {
                id: 'isPreserve',
                header: () => {
                    return (
                        <HeaderCombobox
                            label={t('global.preserve')}
                            options={booleanFilterOptions}
                            value={getBooleanComboboxValue(isPreserveFilter)}
                            onChange={(value) => {
                                setTableHeaderValue('isPreserveFilter', getBooleanFormValue(value));
                            }}
                            multiple={false}
                            isSearchEnabled={false}
                        />
                    );
                },
                cell: markConversationAsPreserve,
                sortDescFirst: false,
            }),
            columnHelper.accessor('comment', {
                id: 'comment',
                header: () => {
                    return (
                        <HeaderCombobox
                            label={t('chat.history.comment') ?? ''}
                            options={booleanFilterOptions}
                            value={getBooleanComboboxValue(hasCommentFilter)}
                            onChange={(value) => {
                                setTableHeaderValue('hasCommentFilter', getBooleanFormValue(value));
                            }}
                            multiple={false}
                            isSearchEnabled={false}
                        />
                    );
                },
                cell: commentView,
                enableSorting: false,
                sortDescFirst: false,
            }),
            columnHelper.accessor('feedbackRating', {
                id: 'feedbackRating',
                header: () => {
                    return (
                        <HeaderCombobox
                            label={t('chat.history.rating') ?? ''}
                            options={ratingOptions}
                            value={feedbackRatings}
                            allOptionValue={ALL_COLUMNS_VALUE}
                            onChange={(value) => {
                                setTableHeaderValue(
                                    'feedbackRatings',
                                    normalizeAllOptionFilterValues(
                                        value,
                                        feedbackRatings,
                                        getAllStringFilterValues(realRatingOptions)
                                    )
                                );
                            }}
                            isApplyBtnVisible
                        />
                    );
                },
                cell: (props) => {
                    const value = props.getValue();
                    return value !== null && value !== undefined ? <span>{`${value}/${props.row.original?.isFiveRatingScale === 'true' ? 5 : 10}`}</span> : null;
                },
                sortDescFirst: false,
            }),
            columnHelper.accessor('feedbackText', {
                id: 'feedbackText',
                header: () => {
                    return (
                        <HeaderCombobox
                            label={t('chat.history.feedback') ?? ''}
                            options={booleanFilterOptions}
                            value={getBooleanComboboxValue(hasFeedbackFilter)}
                            onChange={(value) => {
                                setTableHeaderValue('hasFeedbackFilter', getBooleanFormValue(value));
                            }}
                            multiple={false}
                            isSearchEnabled={false}
                        />
                    );
                },
                cell: feedbackTextView,
                enableSorting: false,
                sortDescFirst: false,
            }),
            columnHelper.accessor('status', {
                id: 'status',
                header: () => {
                    return (
                        <HeaderCombobox
                            label={t('global.status') ?? ''}
                            options={statusOptions}
                            value={status}
                            allOptionValue={ALL_COLUMNS_VALUE}
                            onChange={(value) => {
                                setTableHeaderValue(
                                    'status',
                                    normalizeAllOptionFilterValues(
                                        value,
                                        status,
                                        getAllStringFilterValues(realStatusOptions)
                                    )
                                );
                            }}
                            isApplyBtnVisible
                            isSearchEnabled={true}
                        />
                    );
                },
                cell: statusView,
                sortingFn: (a, b, isAsc) => {
                    const statusA =
                        a.getValue('status') === CHAT_STATUS.ENDED
                            ? t('chat.plainEvents.' + (a.original.lastMessageEvent ?? ''))
                            : '';
                    const statusB =
                        b.getValue('status') === CHAT_STATUS.ENDED
                            ? t('chat.plainEvents.' + (b.original.lastMessageEvent ?? ''))
                            : '';
                    return (
                        statusA.localeCompare(statusB, undefined, {
                            numeric: true,
                            sensitivity: 'base',
                        }) * (isAsc ? 1 : -1)
                    );
                },
                sortDescFirst: false,
            }),
            columnHelper.accessor('id', {
                id: 'id',
                header: 'ID',
                cell: idView,
                enableSorting: false,
                sortDescFirst: false,
            }),
            columnHelper.accessor('endUserUrl', {
                id: 'www',
                header: () => {
                    return (
                        <HeaderCombobox
                            label={t('chat.history.www') ?? ''}
                            value={domains}
                            options={domainOptions}
                            allOptionValue={ALL_COLUMNS_VALUE}
                            onChange={(value) => {
                                setTableHeaderValue(
                                    'domains',
                                    normalizeAllOptionFilterValues(value, domains, currentDomains)
                                );
                            }}
                            isApplyBtnVisible
                        />
                    );
                },
                cell: wwwView,
                sortDescFirst: false,
            }),
            ...isChatAnalysisEnabled ? [
                columnHelper.accessor(
                    (row) => formatChatAnalysisCell(
                        row.theme,
                        t('chat.quality.selectionEmptied')
                    ),
                    {
                        id: 'theme',
                        header: () => (
                            <HeaderCombobox
                                label={t('chat.history.theme')}
                                options={themeOptions}
                                value={theme}
                                allOptionValue={ALL_COLUMNS_VALUE}
                                onChange={(value) => {
                                    setTableHeaderValue(
                                        'theme',
                                        normalizeAllOptionFilterValues(
                                            value,
                                            theme,
                                            getAllStringFilterValues(realThemeOptions)
                                        )
                                    );
                                }}
                                isApplyBtnVisible
                            />
                        ),
                        enableSorting: true,
                    }
                ),
                columnHelper.accessor(
                    (row) => formatChatAnalysisCell(
                        row.responseQuality,
                        t('chat.quality.selectionEmptied')
                    ),
                    {
                        id: 'responseQuality',
                        header: () => (
                            <HeaderCombobox
                                label={t('chat.history.responseQuality')}
                                options={responseQualityOptions}
                                value={responseQuality}
                                allOptionValue={ALL_COLUMNS_VALUE}
                                onChange={(value) => {
                                    setTableHeaderValue(
                                        'responseQuality',
                                        normalizeAllOptionFilterValues(
                                            value,
                                            responseQuality,
                                            getAllStringFilterValues(realResponseQualityOptions)
                                        )
                                    );
                                }}
                                isApplyBtnVisible
                            />
                        ),
                        enableSorting: true,
                    }
                ),
                columnHelper.accessor(
                    (row) => formatChatAnalysisCell(
                        row.followUpStatus,
                        t('chat.quality.selectionEmptied')
                    ),
                    {
                        id: 'followUpStatus',
                        header: () => (
                            <HeaderCombobox
                                label={t('chat.history.followUpStatus')}
                                options={followUpStatusOptions}
                                value={followUpStatus}
                                allOptionValue={ALL_COLUMNS_VALUE}
                                onChange={(value) => {
                                    setTableHeaderValue(
                                        'followUpStatus',
                                        normalizeAllOptionFilterValues(
                                            value,
                                            followUpStatus,
                                            getAllStringFilterValues(realFollowUpStatusOptions)
                                        )
                                    );
                                }}
                                isApplyBtnVisible
                            />
                        ),
                        enableSorting: true,
                    }
                ),
            ] : [],
            columnHelper.display({
                id: 'detail',
                cell: detailsView,
                meta: {
                    size: '3%',
                    sticky: 'right',
                },
            }),
        ];

        return columns;
    }, [
        t,
        showEmail,
        testMessageEnabled,
        customerSupportAgentsQuery.data,
        csaIdCodesFilter,
        feedbackRatings,
        showAuthenticatedPerson,
        isTestFilter,
        isPreserveFilter,
        hasCommentFilter,
        hasFeedbackFilter,
        domains,
        status,
        theme,
        responseQuality,
        followUpStatus,
        statusOptions,
        realStatusOptions,
        themeOptions,
        responseQualityOptions,
        followUpStatusOptions,
        realThemeOptions,
        realResponseQualityOptions,
        realFollowUpStatusOptions,
        currentDomains,
        ratingOptions,
        realRatingOptions,
        domainOptions,
        booleanFilterOptions,
        isChatAnalysisEnabled,
    ])

    const getSortingString = () => {
        if (sorting && sorting.length > 0) {
            const sortingObject = sorting[0];
            const sortingString = t('sorting.sorting');
            const orderingString = t(`sorting.${sortingObject.desc ? 'desc' : 'asc'}`);
            const column = getColumnTranslation(sortingObject.id);
            return sortingString + ' ' + column + ' ' + orderingString;
        } else {
            return '';
        }
    }

    const getColumnTranslation = (column: string): string => {
        switch (column) {
            case 'endUserId':
                return t('global.idCode') ?? ''
            case 'created':
                return t('chat.history.startTime') ?? ''
            case 'ended':
                return t('chat.history.endTime') ?? ''
            case 'customerSupportFullName':
                return t('chat.history.csaName') ?? ''
            case 'endUserName':
                return t('global.name') ?? ''
            case 'endUserEmail':
                return t('global.email') ?? ''
            case 'contactsMessage':
                return t('chat.history.contact') ?? ''
            case 'comment':
                return t('chat.history.comment') ?? ''
            case 'feedbackRating':
                return t('chat.history.rating') ?? ''
            case 'feedbackText':
                return t('chat.history.feedback') ?? ''
            case 'theme':
                return t('chat.history.theme') ?? ''
            case 'responseQuality':
                return t('chat.history.responseQuality') ?? ''
            case 'followUpStatus':
                return t('chat.history.followUpStatus') ?? ''
            case 'status':
                return t('global.status') ?? ''
            case 'endUserUrl':
                return 'www'
            case 'id':
                return 'id';
            case 'istest':
                return t('global.test') ?? ''
            case 'isPreserve':
                return t('global.preserve') ?? ''
            default:
                return '';
        }
    }

    const handleChatStatusChange = (event: string) => {
        if (!selectedChat) return;
        chatStatusChangeMutation.mutate({
            chatId: selectedChat.id,
            event: event.toUpperCase(),
        });
    };

    const handleCommentChange = (comment: string) => {
        if (!selectedChat) return;
        chatCommentChangeMutation.mutate({
            chatId: selectedChat.id,
            comment,
            authorDisplayName: userInfo!.displayName,
        });
    };

    const getFilteredColumns = () => {
        const realSelectedColumns = getRealSelectedColumns(selectedColumns);

        if (realSelectedColumns.length === 0) return endedChatsColumns;
        return endedChatsColumns.filter((c) =>
            ['detail', 'forward', ...realSelectedColumns].includes(c.id ?? '')
        );
    };

    const filterChatsList = (chatsList: ChatType[]) => {
        const startDate = Date.parse(
            format(new Date(control._formValues.startDate), 'MM/dd/yyyy')
        );

        const endDate = Date.parse(
            format(new Date(control._formValues.endDate), 'MM/dd/yyyy')
        );

        setFilteredEndedChatsList(
            chatsList.filter((c) => {
                const ended = Date.parse(format(new Date(c.ended), 'MM/dd/yyyy'));
                return ended >= startDate && ended <= endDate;
            })
        );
    };

    const mapChatsToExportRows = (
        chats: ChatType[],
        allColumns: any[],
        selectedColumns: string[],
        t: (key: string) => string
    ): ExportResult => {
        const realSelectedColumns = getRealSelectedColumns(selectedColumns);
        const activeColumns =
            realSelectedColumns.length > 0
                ? allColumns.filter(
                    (col) => col.id && col.id !== 'detail' && realSelectedColumns.includes(col.id)
                )
                : allColumns.filter((col) => col.id && col.id !== 'detail');

        const headers = activeColumns.map(
            (col) => getColumnTranslation(col.id) || col.header || col.id
        );

        const rows = chats.map((chat) =>
            activeColumns.map((col) => {
                let rawValue: any = null;

                if (typeof col.accessorFn === 'function') {
                    rawValue = col.accessorFn(chat, 0);
                } else if (typeof col.accessorKey === 'string') {
                    rawValue = (chat as any)[col.accessorKey];
                }

                let processedValue: any = rawValue;
                const totalCheck = chat.isFiveRatingScale === 'true' ? 5 : 10;
                switch (col.id) {
                    case 'created':
                    case 'ended':
                        processedValue = rawValue
                            ? format(
                                new Date(rawValue),
                                'dd.MM.yyyy HH:mm:ss',
                                i18n.language === 'et' ? {locale: et} : undefined
                            )
                            : '';
                        break;
                    case 'contactsMessage':
                        processedValue = rawValue ? t('global.yes') : t('global.no');
                        break;
                    case 'feedbackRating':
                        processedValue = rawValue == null ? '' : `${rawValue}/${totalCheck}`;
                        break;
                    case 'status':
                        processedValue =
                            chat.status === CHAT_STATUS.ENDED
                                ? t('chat.plainEvents.' + (chat.lastMessageEvent ?? ''))
                                : '';
                        break;
                    case 'endUserName':
                        processedValue = `${chat.endUserFirstName ?? ''} ${chat.endUserLastName ?? ''}`;
                        break;
                    default:
                        processedValue =
                            typeof rawValue === 'object' ? JSON.stringify(rawValue) : rawValue ?? '';
                }

                return processedValue;
            })
        );

        const chatIds = chats.map((c) => c.id);

        return {headers, rows, chatIds};
    };

    const downloadChatHistory = async () => {
        setLoading(true);
        try {
            const sortBy = getEndedChatsSortBy(sorting);

            const realSelectedColumns = getRealSelectedColumns(selectedColumns);
            const { headers } = mapChatsToExportRows([], endedChatsColumns, realSelectedColumns, t);
            const activeColumns = realSelectedColumns.length > 0
                ? endedChatsColumns.filter((col) => col.id && col.id !== 'detail' && realSelectedColumns.includes(col.id))
                : endedChatsColumns.filter((col) => col.id && col.id !== 'detail');
            const columnIds = activeColumns.map((col) => col.id!);

            const response = await apiDevEnded.post<{
                readonly response: {
                    readonly data: {
                        readonly url: string;
                    };
                };
            }>('chats/ended/download', {
                headers,
                columnIds,
                language: i18n.language,
                startDate: formatISO(startOfDay(new Date(startDate))),
                endDate: formatISO(endOfDay(new Date(endDate))),
                ...endedChatsFilterBody,
                sorting: sortBy,
                search,
            });
            const downloadData = response.data.response.data;

            await saveFile(
                downloadData.url,
                'history.xlsx',
            );

        } catch (error) {
            console.error('Error downloading chat history file:', error);
        } finally {
            setLoading(false);
        }
    };

    const onClearFilersClick = () => {
        setCounterKey(0);
        setValue('search', '');
        resetTableHeaderForm({
            csaIdCodesFilter: [],
            feedbackRatings: [],
            showAuthenticatedPerson: undefined,
            isTestFilter: undefined,
            isPreserveFilter: undefined,
            hasCommentFilter: undefined,
            hasFeedbackFilter: undefined,
            domains: [],
            status: [],
            theme: [],
            responseQuality: [],
            followUpStatus: [],
        });
    };

    const chatQualityMeasurementQuery = useQuery({
        queryKey: ['chats/quality/measurements', selectedChat?.id],
        queryFn: () => getQualityMeasurements({ chatUuid: selectedChat!.id }),
        enabled: !!selectedChat?.id,
    });

    const selectedQualityMeasurements = useMemo(() => {
        const measurements = chatQualityMeasurementQuery.data?.data.response ?? [];

        const latest = {
            theme: {
                time: Number.NEGATIVE_INFINITY,
                values: [] as string[],
            },
            quality: {
                time: Number.NEGATIVE_INFINITY,
                value: '',
            },
            followUp: {
                time: Number.NEGATIVE_INFINITY,
                value: '',
            },
        };

        measurements.forEach(({ type, value, createdAt }) => {
            const parsedTime = Date.parse(createdAt);
            const time = Number.isNaN(parsedTime) ? 0 : parsedTime;

            if (type === MEASUREMENT_TYPES.THEME) {
                if (time > latest.theme.time) {
                    latest.theme.time = time;
                    latest.theme.values = value ? [value] : [];
                } else if (time === latest.theme.time && value) {
                    latest.theme.values.push(value);
                }

                return;
            }


            if (type === MEASUREMENT_TYPES.QUALITY && time >= latest.quality.time) {
                latest.quality.time = time;
                latest.quality.value = value;
                return;
            }

            if (type === MEASUREMENT_TYPES.FOLLOW_UP_ACTION && time >= latest.followUp.time) {
                latest.followUp.time = time;
                latest.followUp.value = value;
                return;
            }
        });

        return {
            theme: latest.theme.values,
            quality: latest.quality.value,
            followUp: latest.followUp.value,
        };
    }, [chatQualityMeasurementQuery.data]);

    const chatAnalysisFieldByMeasurementType: Record<MeasurementType, 'theme' | 'responseQuality' | 'followUpStatus'> = {
        [MEASUREMENT_TYPES.THEME]: 'theme',
        [MEASUREMENT_TYPES.QUALITY]: 'responseQuality',
        [MEASUREMENT_TYPES.FOLLOW_UP_ACTION]: 'followUpStatus',
    };

    const chatQualityMeasurementMutation = useMutation({
        mutationFn: postQualityMeasurements,
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['chats/quality/measurements', variables.chatUuid],
            });

            const field = chatAnalysisFieldByMeasurementType[variables.type];
            const value = Array.isArray(variables.value) ? variables.value : [variables.value];

            setFilteredEndedChatsList((prevChats) =>
                prevChats.map((chat) =>
                    chat.id === variables.chatUuid ? ({ ...chat, [field]: value } as ChatType) : chat
                )
            );

            if (selectedChat?.id === variables.chatUuid) {
                setSelectedChat({ ...selectedChat, [field]: value } as ChatType);
            }
        },
        onError: (error: AxiosError) => {
            toast?.open({
                type: 'error',
                title: t('global.notificationError'),
                message: error.message,
            });
        },
    });

    const saveChatQualityMeasurement = async (
        type: MeasurementType,
        value: string | string[],
        successMessage: string
    ) => {
        if (!selectedChat?.id) return;

        try {
            await chatQualityMeasurementMutation.mutateAsync({
                chatUuid: selectedChat.id,
                type,
                value,
            });

            toast?.open({
                type: 'success',
                title: t('global.notification'),
                message: successMessage,
            });
        } catch {
            // Error toast is handled by the mutation's onError callback.
        }
    };

    const onChatThemeChange = async (value: string[]) => {
        // TODO: array support in backend
            saveChatQualityMeasurement(
                MEASUREMENT_TYPES.THEME,
                value,
                t('toast.success.conversationThemeSaved')
            )
    }

    const onChatQualityChange = async (value: string) => {
        await saveChatQualityMeasurement(
            MEASUREMENT_TYPES.QUALITY,
            value,
            t('toast.success.conversationQualitySaved')
        );
    }
    const onChatFollowUpChange = async (value: string) => {
        await saveChatQualityMeasurement(
            MEASUREMENT_TYPES.FOLLOW_UP_ACTION,
            value,
            t('toast.success.conversationFollowUpActionSaved')
        );
    }

    if (!filteredEndedChatsList) return <>Loading... {{filteredEndedChatsList}} something is wrong </>;

    return (
        <div className="history-page-wrapper">
            <div className="header-container">
                {displayTitle && (
                    <h1>{t('chat.history.title')}{totalCount === null ? '' : ` (${totalCount.toLocaleString('et-EE')})`}</h1>
                )}

                {showDownload && (
                    <div>
                        <Button
                            type="button"
                            appearance={"secondary"}
                            size="s"
                            style={{ marginTop: '4px' }}
                            onClick={downloadChatHistory}
                        >
                            {loading && <CgSpinner className="spinner" />}
                            {!loading && t('files.download_xlsx')}
                        </Button>
                    </div>
                )}
            </div>

            <div className={`history-content${getAllEndedChats.isPending ? ' history-content--loading' : ''}`}>
            <Card style={{marginBottom: '16px'}}>
                <Track gap={16}>
                    {displaySearchBar && (
                        <Controller name="search" control={control} render={({ field }) => {
                            return <FormInput
                                label={t('chat.history.searchChats')}
                                hideLabel
                                name="searchChats"
                                value={field.value}
                                placeholder={t('chat.history.searchChats') + '...'}
                                onChange={(e) => {
                                    setPagination({ pageIndex: 0, pageSize: pagination.pageSize });
                                    setSearchParams((params) => {
                                        params.set("page", "1");
                                        return params;
                                    });
                                    field.onChange(e.target.value);
                                    debouncedGetAllEnded(e.target.value);
                                }}
                            />
                        }} />
                    )}
                    <Track gap={16}>
                        {displayDateFilter && (
                            <>
                                <Track gap={10}>
                                    <p>{t('global.from')}</p>
                                    <Controller
                                        name="startDate"
                                        control={control}
                                        render={({field}) => {
                                            return (
                                                <FormDatepicker
                                                    {...field}
                                                    label={''}
                                                    value={field.value ?? new Date()}
                                                    onChange={(v) => {
                                                        field.onChange(v);
                                                        const start = formatISO(startOfDay(new Date(v)));
                                                        const resetPagination = { pageIndex: 0, pageSize: pagination.pageSize };
                                                        setPagination(resetPagination);
                                                        setSearchParams((params) => {
                                                            params.set("page", "1");
                                                            params.set('start', start);
                                                            return params;
                                                        });
                                                        getAllEndedChats.mutate({
                                                            startDate: start,
                                                            endDate: formatISO(endOfDay(new Date(endDate))),
                                                            pagination: resetPagination,
                                                            sorting,
                                                            search,
                                                        });
                                                    }}
                                                />
                                            );
                                        }}
                                    />
                                </Track>
                                <Track gap={10}>
                                    <p>{t('global.to')}</p>
                                    <Controller
                                        name="endDate"
                                        control={control}
                                        render={({field}) => {
                                            return (
                                                <FormDatepicker
                                                    {...field}
                                                    label={''}
                                                    value={field.value ?? new Date()}
                                                    onChange={(v) => {
                                                        field.onChange(v);
                                                        const end = formatISO(endOfDay(new Date(v)));
                                                        const resetPagination = { pageIndex: 0, pageSize: pagination.pageSize };
                                                        setPagination(resetPagination);
                                                        setSearchParams((params) => {
                                                            params.set("page", "1");
                                                            params.set('end', end);
                                                            return params;
                                                        });
                                                        getAllEndedChats.mutate({
                                                            startDate: formatISO(startOfDay(new Date(startDate))),
                                                            endDate: end,
                                                            pagination: resetPagination,
                                                            sorting,
                                                            search,
                                                        });
                                                    }}
                                                />
                                            );
                                        }}
                                    />
                                </Track>
                            </>
                        )}
                        <Track style={{width: '240px'}}>
                        <FormCombobox
                            key={counterKey}
                            name="visibleColumns"
                            label={t('')}
                            placeholder={t('chat.history.chosenColumn')}
                            options={visibleColumnOptions}
                            value={selectedColumns}
                            selectedOptionsCount={getRealSelectedColumns(selectedColumns).length}
                            multiple={true}
                            allOptionValue={ALL_COLUMNS_VALUE}
                            preserveOptionsOrder
                            direction="down"
                            onChange={(selection) => {
                                const columns = getUiSelectedColumns(selection);
                                setSelectedColumns(columns);
                                setCounterKey(prev => prev + 1);
                                updatePagePreferences.mutate({
                                    page_results: pagination.pageSize,
                                    selected_columns: getRealSelectedColumns(columns),
                                })
                            }}
                            isApplyBtnVisible
                            />
                        </Track>
                    </Track>
                </Track>
            </Card>

            {sorting && sorting.length > 0 && showSortingLabel && (
                <div>
                    <Button disabled={true} appearance="secondary">
                        {getSortingString()}
                    </Button>
                </div>)
            }
            <SelectedFilterTags
                csaFilterTagValues={csaFilterTagValues}
                getCsaFilterTagLabel={getCsaFilterTagLabel}
                showAuthenticatedPerson={showAuthenticatedPerson}
                showTestFilter={testMessageEnabled}
                isTestFilter={isTestFilter}
                isPreserveFilter={isPreserveFilter}
                hasCommentFilter={hasCommentFilter}
                hasFeedbackFilter={hasFeedbackFilter}
                domains={domainFilterValues}
                feedbackRatings={feedbackRatingFilterValues}
                status={statusFilterValues}
                theme={themeFilterValues}
                responseQuality={responseQualityFilterValues}
                followUpStatus={followUpStatusFilterValues}
                onRemove={removeSelectedFilterTag}
                onClearFiltersClick={onClearFilersClick}
            />
            <div className="card-drawer-container">
                <div className="card-wrapper">
                    <Card>
                        <DataTable
                            data={filteredEndedChatsList}
                            sortable
                            stickyHeader
                            columns={getFilteredColumns()}
                            selectedRow={(row) => row.original.id === selectedChat?.id}
                            pagination={pagination}
                            columnPinning={columnPinning}
                            sorting={sorting}
                            setPagination={(state: PaginationState) => {
                                if (
                                    state.pageIndex === pagination.pageIndex &&
                                    state.pageSize === pagination.pageSize
                                )
                                    return;
                                setPagination(state);
                                updatePagePreferences.mutate({
                                    page_results: state.pageSize,
                                    selected_columns: getRealSelectedColumns(selectedColumns)
                                });
                                getAllEndedChats.mutate({
                                    startDate: formatISO(startOfDay(new Date(startDate))),
                                    endDate: formatISO(endOfDay(new Date(endDate))),
                                    pagination: state,
                                    sorting,
                                    search,
                                });
                            }}
                            setSorting={(state: SortingState) => {
                                setSorting(state);
                                getAllEndedChats.mutate({
                                    startDate: formatISO(startOfDay(new Date(startDate))),
                                    endDate: formatISO(endOfDay(new Date(endDate))),
                                    pagination,
                                    sorting: state,
                                    search,
                                });
                            }}
                            isClientSide={false}
                            pagesCount={totalPages}
                            totalCountLabel={totalCount === null ? null : `${t('chat.history.title')} ${totalCount.toLocaleString('et-EE')}`}
                        />
                    </Card>
                </div>

                {selectedChat && (
                    <>
                        <div className="drawer-container">
                            <Drawer
                                title={
                                    selectedChat.endUserFirstName !== '' &&
                                    selectedChat.endUserLastName !== ''
                                        ? `${selectedChat.endUserFirstName} ${selectedChat.endUserLastName}`
                                        : t('global.anonymous')
                                }
                                onClose={() => setSelectedChat(null)}
                            >
                                <HistoricalChat
                                    chat={selectedChat}
                                    trigger={messagesTrigger}
                                    onChatStatusChange={setStatusChangeModal}
                                    selectedStatus={chatState}
                                    onCommentChange={handleCommentChange}
                                    toastContext={toastContext}
                                    showComment={showComment}
                                    showStatus={showStatus}
                                    onMessageClick={(message) => {
                                        onMessageClick?.(message);
                                    }}
                                />
                            </Drawer>
                        </div>
                            <ChatMetadataPanel
                                chat={selectedChat}
                                chatMeasurments={chatQualityMeasurementQuery.data?.data.response ?? []}
                            >
                                <QualitySettings
                                    theme={{
                                        onChange: (value) => onChatThemeChange(value),
                                        options: qualitySettingsConfigQuery.data?.chatAnalysisTheme.map(item => {
                                            return { label: item, value: item }
                                        }) ?? [],
                                        value: selectedQualityMeasurements.theme,
                                    }}
                                    quality={{
                                        onChange: (value) => onChatQualityChange(value),
                                        options: qualitySettingsConfigQuery.data?.chatAnalysisBykResponseQuality.map(item => {
                                            return { label: item, value: item }
                                        }) ?? [],
                                        value: selectedQualityMeasurements.quality,
                                    }}
                                    followUp={{
                                        onChange: (value) => onChatFollowUpChange(value),
                                        options: qualitySettingsConfigQuery.data?.chatAnalysisFollowUpAction.map(item => {
                                            return { label: item, value: item }
                                        }) ?? [],
                                        value: selectedQualityMeasurements.followUp,
                                    }}
                                />
                            </ChatMetadataPanel>
                        </>
                    )}
                </div>
            </div>

            {statusChangeModal && (
                <Dialog
                    title={t('chat.changeStatus')}
                    onClose={() => setStatusChangeModal(null)}
                    footer={
                        <>
                            <Button
                                appearance="secondary"
                                onClick={() => {
                                    setChatState(null);
                                    setStatusChangeModal(null);
                                }}
                            >
                                {t('global.cancel')}
                            </Button>
                            <Button
                                appearance="error"
                                onClick={() => {
                                    setChatState(statusChangeModal);
                                    handleChatStatusChange(statusChangeModal);
                                }}
                            >
                                {t('global.yes')}
                            </Button>
                        </>
                    }
                >
                    <p>{t('global.removeValidation')}</p>
                </Dialog>
            )}
        </div>
    );
};

export default ChatHistory;
