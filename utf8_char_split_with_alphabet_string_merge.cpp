
// utf8字符串切成单字，对于字母或数字，则不切开
int utf8_char_split(const char* utf8_query, size_t query_size, 
                    std::vector<std::pair<int, int> > & split_pos)
{
    const unsigned char * query = (const unsigned char *)utf8_query;
    if (query == NULL) {
        printf("query is NULL");
        return -1; 
    }   
    const unsigned char UTF8_prefix[] = {0x80,  // 0b-10xx-xxxx utf8后续字节前缀
                                0x0,   // 0b-0xxx-xxxx utf8前缀:本字节后跟0字节
                                0xC0,  // 0b-110x-xxxx utf8前缀:本字节后跟1字节
                                0xE0,  // 0b-1110-xxxx utf8前缀:本字节后跟2字节
                                0xF0,  // 0b-1111-0xxx utf8前缀:本字节后跟3字节
                                0xF8,  // 0b-1111-10xx utf8前缀:本字节后跟4字节
                                0xFC}; // 0b-1111-110x utf8前缀:本字节后跟5字节

    const unsigned char UTF8_mask[] = {0xC0,    // 0b-1100-0000
                              0x80,    // 0b-1000-0000
                              0xE0,    // 0b-1110-0000
                              0xF0,    // 0b-1111-0000
                              0xF8,    // 0b-1111-1000
                              0xFC,    // 0b-1111-1100
                              0xFE};   // 0b-1111-1110

    split_pos.clear();

    std::vector<int> char_type;
    for (size_t i = 0; i < query_size; ++i) {
        unsigned char c = query[i];
        if (c == 0xFF) {
            printf("query=%s has invalid char=0xFF", query);
            return -1;
        }
        // 识别本字节属于哪种字节
        for (size_t j = 0; j < sizeof(UTF8_prefix) / sizeof(unsigned char); ++j) {
            if ((c & UTF8_mask[j]) == UTF8_prefix[j]) {
                // printf("[%d:%d]", char_type.size(), j);
                char_type.push_back(j);
            }
        }
    }
    if (char_type.size() != query_size) {
        printf("query=%s is not a valid utf8 string", query);
        return -1;
    }
    
    int last_alpha_num_pos = -1;
    for (size_t i = 0; i < char_type.size(); ++i) {
        // 以"后续字节"面目出现, ERROR
        if (char_type[i] == 0) {
            printf("query=%s has invalid char: bad prefix byte", query);
            return -1;
        }

        if (char_type[i] == 1) { // 字母或数字或下划线
            if (query[i] >= 'a' && query[i] <= 'z'
                               || query[i] >= 'A' && query[i] <= 'Z'
                               || query[i] >= '0' && query[i] <= '9'
                               || query[i] == '_' || query[i] == '-') {

                if (last_alpha_num_pos < 0) {
                    last_alpha_num_pos = i;
                }
                continue;
            }
        }
        // printf("\nxx %d\n", i);
        if (last_alpha_num_pos >= 0) {
            split_pos.push_back(std::make_pair(last_alpha_num_pos, i - last_alpha_num_pos));
            last_alpha_num_pos = -1;
        }
        
        // 1~6字节的utf8字符的判断
        int next_char_cnt = char_type[i] - 1;
        if (i + next_char_cnt >= char_type.size()) {
            printf("query=%s has invalid char: not enought next bytes, pos=%d", query, i);
            return -1;
        }
        split_pos.push_back(std::make_pair(i, next_char_cnt + 1));
        for (size_t j = 0; j < next_char_cnt; ++j) {
            if (char_type[i+j+1] != 0) {
                printf("query=%s has invalid char: bad next byte, pos_start=%d pos_cur=%d",
                                query, i, i+j+1);
                return -1;
            }
        }
        i += next_char_cnt;
    }
    if (last_alpha_num_pos >= 0) {
        split_pos.push_back(std::make_pair(last_alpha_num_pos,
                                           char_type.size() - last_alpha_num_pos));
    }
    return 0;
}
