<template>
    <div class="select-wrapper" @click="toggleDropdown">
        <div class="select-content">
            <span class="title">{{ title }}</span>
            <svg class="arrow-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8.33333 4.16667L14.1667 10L8.33333 15.8333" stroke="var(--stay-black)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <div v-if="isOpen" class="dropdown-list" @click.stop>
            <div v-for="(item, index) in options" 
                 :key="index" 
                 class="dropdown-item"
                 @click.stop="selectItem(item)">
                {{ item }}
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps({
    title: {
        type: String,
        required: true
    },
    options: {
        type: Array,
        default: () => []
    }
});

const emit = defineEmits(['select']);

const isOpen = ref(false);
const selectWrapper = ref(null);

const handleClickOutside = (event) => {
    if (selectWrapper.value && !selectWrapper.value.contains(event.target)) {
        isOpen.value = false;
    }
};

onMounted(() => {
    document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside);
});

const toggleDropdown = () => {
    isOpen.value = !isOpen.value;
};

const selectItem = (item) => {
    emit('select', item);
    isOpen.value = false;
};
</script>

<style lang="less" scoped>
.select-wrapper {
    position: relative;
    cursor: pointer;
    width: 100%;
    display: flex;
    justify-content: flex-end;
    
    .select-content {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        width: 100%;
        
        .title {
            font-size: var(--stay-text-body);
            color: var(--stay-secondaryFont);
            text-align: right;
            flex: 1;
        }
        
        .arrow-icon {
            width: 20px;
            height: 20px;
            display: block;
        }
    }
    
    .dropdown-list {
        position: absolute;
        top: 100%;
        right: 0;
        background: white;
        border: 1px solid #E0E0E0;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        z-index: 1000;
        min-width: 150px;
        
        .dropdown-item {
            padding: 8px 16px;
            font-size: var(--stay-text-body);
            color: var(--stay-black);
            text-align: right;
            
            &:hover {
                background-color: #F5F5F5;
            }
        }
    }
}
</style> 